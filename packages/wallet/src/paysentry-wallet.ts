// =============================================================================
// PaySentryWallet — The orchestrator that connects PolicyEngine + WalletAdapter
//
// This is the single entry point for agents. The flow is:
//   Agent → PaySentryWallet.executePayment() → Policy check → Wallet sign
//
// The agent NEVER touches the wallet directly. PaySentryWallet enforces
// all policies before delegating to the WalletAdapter.
// =============================================================================

import type {
  AgentId,
  AgentTransaction,
  Logger,
  PolicyEvaluation,
} from '@paysentry/core';
import { createTransaction } from '@paysentry/core';
import type { PolicyEngine } from '@paysentry/control';
import type { SpendTracker, SpendAlerts } from '@paysentry/observe';

import type {
  WalletAdapter,
  PaySentryWalletConfig,
  PaymentRequest,
  PaymentResult,
  WalletBalance,
} from './types.js';

/**
 * PaySentryWallet is the full-stack payment orchestrator for AI agents.
 *
 * It combines:
 * - **PolicyEngine** — declarative spending rules (allow/deny/require_approval)
 * - **WalletAdapter** — pluggable wallet backend (Coinbase, local, Openfort, etc.)
 * - **SpendTracker** — full transaction audit trail
 * - **SpendAlerts** — real-time anomaly detection and alerting
 *
 * The agent calls `executePayment()` and PaySentryWallet handles everything:
 * 1. Optional balance pre-check
 * 2. Policy evaluation
 * 3. Approval flow (if required)
 * 4. Wallet signing and broadcast
 * 5. Transaction recording and alerting
 *
 * @example
 * ```ts
 * const wallet = new PaySentryWallet({
 *   policyEngine: new PolicyEngine(),
 *   walletAdapter: new CoinbaseAdapter({ apiKey, walletId }),
 *   spendTracker: new SpendTracker(),
 * });
 *
 * // Load policies
 * wallet.policyEngine.loadPolicy({
 *   id: 'production' as PolicyId,
 *   name: 'Production',
 *   enabled: true,
 *   rules: [blockAbove(1000, 'USDC'), requireApprovalAbove(100, 'USDC'), allowAll()],
 *   budgets: [{ window: 'daily', maxAmount: 500, currency: 'USDC' }],
 * });
 *
 * // Agent calls this
 * const result = await wallet.executePayment({
 *   amount: 50,
 *   currency: 'USDC',
 *   to: '0x...',
 *   reason: 'OpenAI API credits',
 * });
 * ```
 */
export class PaySentryWallet {
  /** The policy engine — exposed for loading/modifying policies */
  readonly policyEngine: PolicyEngine;

  /** The wallet adapter — exposed for balance checks */
  readonly wallet: WalletAdapter;

  /** The spend tracker — exposed for querying history */
  readonly spendTracker: SpendTracker;

  /** Optional alerts engine */
  readonly spendAlerts?: SpendAlerts;

  private readonly config: Required<
    Pick<PaySentryWalletConfig, 'defaultCurrency' | 'approvalTimeoutMs' | 'preCheckBalance'>
  > & PaySentryWalletConfig;

  private readonly logger?: Logger;

  constructor(
    engines: {
      policyEngine: PolicyEngine;
      walletAdapter: WalletAdapter;
      spendTracker: SpendTracker;
      spendAlerts?: SpendAlerts;
    },
    config: PaySentryWalletConfig = {},
  ) {
    this.policyEngine = engines.policyEngine;
    this.wallet = engines.walletAdapter;
    this.spendTracker = engines.spendTracker;
    this.spendAlerts = engines.spendAlerts;

    this.config = {
      defaultCurrency: 'USDC',
      approvalTimeoutMs: 300_000, // 5 minutes
      preCheckBalance: true,
      ...config,
    };

    this.logger = config.logger;
  }

  /**
   * Execute a payment. This is the primary method agents should call.
   *
   * Flow:
   * 1. Build AgentTransaction from PaymentRequest
   * 2. (Optional) Pre-check wallet balance
   * 3. Evaluate against PolicyEngine
   * 4. Handle approval if required
   * 5. Delegate to WalletAdapter.signAndSend()
   * 6. Record transaction and evaluate alerts
   *
   * @param request - Payment parameters
   * @returns Result with status, tx hash, and metadata
   */
  async executePayment(request: PaymentRequest): Promise<PaymentResult> {
    const agentId = request.agentId ?? this.config.defaultAgentId ?? ('unknown-agent' as AgentId);
    const currency = request.currency ?? this.config.defaultCurrency;

    // Step 1: Build transaction object
    const tx = createTransaction({
      agentId,
      recipient: request.to,
      amount: request.amount,
      currency,
      purpose: request.reason,
      protocol: 'x402',
      metadata: request.metadata ?? {},
    });

    this.logger?.info(`[PaySentryWallet] Payment request ${tx.id}`, {
      amount: request.amount,
      currency,
      to: request.to,
      agent: agentId,
    });

    // Step 2: Pre-check balance (fail fast)
    if (this.config.preCheckBalance) {
      const balanceResult = await this.checkBalance(tx);
      if (balanceResult) return balanceResult;
    }

    // Step 3: Policy evaluation
    const policyResult = this.policyEngine.evaluate(tx);

    this.logger?.info(`[PaySentryWallet] Policy result: ${policyResult.action}`, {
      txId: tx.id,
      reason: policyResult.reason,
    });

    // Step 4: Handle policy decision
    if (policyResult.action === 'deny') {
      tx.status = 'rejected';
      tx.updatedAt = new Date().toISOString();
      this.spendTracker.record(tx);

      return {
        status: 'denied',
        reason: policyResult.reason,
        transactionId: tx.id,
        policyAction: 'deny',
      };
    }

    if (policyResult.action === 'require_approval') {
      const approved = await this.handleApproval(tx, policyResult);
      if (!approved) {
        tx.status = 'rejected';
        tx.updatedAt = new Date().toISOString();
        this.spendTracker.record(tx);

        return {
          status: approved === null ? 'approval_timeout' : 'denied',
          reason: approved === null
            ? `Approval timed out after ${this.config.approvalTimeoutMs}ms`
            : 'Human reviewer denied the transaction',
          transactionId: tx.id,
          policyAction: 'require_approval',
        };
      }
    }

    // Step 5: Execute via wallet adapter
    try {
      tx.status = 'executing';
      tx.updatedAt = new Date().toISOString();

      const receipt = await this.wallet.signAndSend(tx);

      // Step 6: Record success
      tx.status = 'completed';
      tx.updatedAt = new Date().toISOString();
      tx.protocolTxId = receipt.txHash;

      this.spendTracker.record(tx);
      this.policyEngine.recordTransaction(tx);

      // Fire alerts (non-blocking)
      if (this.spendAlerts) {
        this.spendAlerts.evaluate(tx).catch((err) => {
          this.logger?.error('[PaySentryWallet] Alert evaluation failed', err);
        });
      }

      this.logger?.info(`[PaySentryWallet] Payment completed: ${receipt.txHash}`, {
        txId: tx.id,
        network: receipt.network,
      });

      return {
        status: 'completed',
        reason: 'Transaction executed successfully',
        txHash: receipt.txHash,
        network: receipt.network,
        transactionId: tx.id,
        policyAction: policyResult.action,
      };
    } catch (error) {
      // Record failure
      tx.status = 'failed';
      tx.updatedAt = new Date().toISOString();
      this.spendTracker.record(tx);

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger?.error(`[PaySentryWallet] Payment failed: ${errorMsg}`, {
        txId: tx.id,
      });

      return {
        status: 'failed',
        reason: `Wallet execution failed: ${errorMsg}`,
        transactionId: tx.id,
        policyAction: policyResult.action,
      };
    }
  }

  /**
   * Shorthand for `executePayment()`. Ideal for quick, simple payments.
   *
   * @example
   * ```ts
   * await wallet.pay(25, '0xRecipient', 'API credits');
   * await wallet.pay(25, '0xRecipient'); // reason defaults to empty
   * ```
   */
  async pay(
    amount: number,
    to: string,
    reason: string = '',
  ): Promise<PaymentResult> {
    return this.executePayment({
      amount,
      currency: this.config.defaultCurrency,
      to,
      reason,
    });
  }

  /**
   * Get wallet balance for a currency.
   */
  async getBalance(currency?: string): Promise<WalletBalance> {
    return this.wallet.getBalance(currency ?? this.config.defaultCurrency);
  }

  /**
   * Get wallet addresses.
   */
  async getAddresses(): Promise<string[]> {
    return this.wallet.getAddresses();
  }

  /**
   * Get the name of the underlying wallet adapter.
   */
  get walletName(): string {
    return this.wallet.name;
  }

  // ---------------------------------------------------------------------------
  // Private: Balance pre-check
  // ---------------------------------------------------------------------------

  private async checkBalance(tx: AgentTransaction): Promise<PaymentResult | null> {
    try {
      const balance = await this.wallet.getBalance(tx.currency);
      const available = parseFloat(balance.amount);

      if (available < tx.amount) {
        this.logger?.warn('[PaySentryWallet] Insufficient balance', {
          txId: tx.id,
          required: tx.amount,
          available,
          currency: tx.currency,
        });

        tx.status = 'rejected';
        tx.updatedAt = new Date().toISOString();
        this.spendTracker.record(tx);

        return {
          status: 'denied',
          reason: `Insufficient balance: ${available} ${tx.currency} available, ${tx.amount} required`,
          transactionId: tx.id,
          policyAction: 'deny',
        };
      }
    } catch (err) {
      // Balance check failed — log warning but don't block
      // (wallet might not support balance queries)
      this.logger?.warn('[PaySentryWallet] Balance pre-check failed, proceeding', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private: Approval flow
  // ---------------------------------------------------------------------------

  private async handleApproval(
    tx: AgentTransaction,
    _policyResult: PolicyEvaluation,
  ): Promise<boolean | null> {
    if (!this.config.approvalHandler) {
      this.logger?.warn('[PaySentryWallet] No approval handler configured — denying by default');
      return false;
    }

    tx.status = 'approved'; // Temporarily set for the handler to see
    tx.updatedAt = new Date().toISOString();

    // Race between approval handler and timeout
    const approvalPromise = this.config.approvalHandler(tx);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), this.config.approvalTimeoutMs),
    );

    const result = await Promise.race([approvalPromise, timeoutPromise]);

    if (result === null) {
      this.logger?.warn('[PaySentryWallet] Approval timed out', { txId: tx.id });
      return null;
    }

    this.logger?.info(`[PaySentryWallet] Approval result: ${result ? 'approved' : 'denied'}`, {
      txId: tx.id,
    });

    return result;
  }
}
