// =============================================================================
// createWallet() — The "Stripe-like" one-liner for PaySentry
//
// Before:  34+ lines of imports, engine wiring, policy loading
// After:   createWallet({ adapter: ..., limits: presets.standard })
// =============================================================================

import type {
  AgentId,
  PolicyId,
  Logger,
  ApprovalHandler,
} from '@paysentry/core';
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';
import { SpendTracker } from '@paysentry/observe';

import { PaySentryWallet } from './paysentry-wallet.js';
import { CoinbaseAdapter } from './coinbase-adapter.js';
import { LocalSignerAdapter } from './local-signer-adapter.js';
import type { WalletAdapter } from './types.js';
import type { SpendLimits } from './presets.js';

// ---------------------------------------------------------------------------
// Adapter config — discriminated union for type-safe adapter selection
// ---------------------------------------------------------------------------

interface CoinbaseAdapterOption {
  readonly type: 'coinbase';
  readonly apiKey: string;
  readonly walletId: string;
  readonly network?: string;
}

interface LocalAdapterOption {
  readonly type: 'local';
  readonly keystorePath: string;
  readonly passphrase: string;
  readonly rpcUrl: string;
  readonly network?: string;
}

interface CustomAdapterOption {
  readonly type: 'custom';
  readonly instance: WalletAdapter;
}

type AdapterOption = CoinbaseAdapterOption | LocalAdapterOption | CustomAdapterOption;

// ---------------------------------------------------------------------------
// createWallet options
// ---------------------------------------------------------------------------

export interface CreateWalletOptions {
  /**
   * Wallet adapter to use.
   *
   * @example
   * // Coinbase (managed custody)
   * adapter: { type: 'coinbase', apiKey: '...', walletId: '...' }
   *
   * // Local encrypted keystore (self-custody)
   * adapter: { type: 'local', keystorePath: '...', passphrase: '...', rpcUrl: '...' }
   *
   * // Custom adapter implementation
   * adapter: { type: 'custom', instance: myAdapter }
   */
  readonly adapter: AdapterOption;

  /**
   * Spending limits. Use `presets.standard` for quick setup, or customize.
   * If omitted, a permissive policy (allowAll) is used.
   *
   * @example
   * limits: { daily: 500, perTx: 100 }
   * limits: presets.standard
   */
  readonly limits?: SpendLimits;

  /** Default agent ID for all payments */
  readonly agentId?: string;

  /** Handler for transactions requiring human approval */
  readonly approvalHandler?: ApprovalHandler;

  /** Max wait time for approval in ms (default: 300_000 = 5 min) */
  readonly approvalTimeoutMs?: number;

  /** Pre-check balance before policy evaluation (default: true) */
  readonly preCheckBalance?: boolean;

  /** Logger instance */
  readonly logger?: Logger;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fully-wired PaySentryWallet in one call.
 *
 * Handles all engine wiring: PolicyEngine + SpendTracker + WalletAdapter.
 * Translates simple `limits` into full policy rules automatically.
 *
 * @example
 * ```ts
 * import { createWallet, presets } from '@paysentry/wallet';
 *
 * const wallet = createWallet({
 *   adapter: { type: 'coinbase', apiKey: '...', walletId: '...' },
 *   limits: presets.standard,
 * });
 *
 * const result = await wallet.pay(25, '0xRecipient', 'API credits');
 * ```
 */
export function createWallet(options: CreateWalletOptions): PaySentryWallet {
  // 1. Resolve adapter
  const walletAdapter = resolveAdapter(options.adapter, options.logger);

  // 2. Build policy engine from limits
  const policyEngine = buildPolicyEngine(options.limits);

  // 3. Create tracker
  const spendTracker = new SpendTracker();

  // 4. Assemble
  return new PaySentryWallet(
    { policyEngine, walletAdapter, spendTracker },
    {
      defaultAgentId: options.agentId
        ? (options.agentId as AgentId)
        : undefined,
      approvalHandler: options.approvalHandler,
      approvalTimeoutMs: options.approvalTimeoutMs,
      preCheckBalance: options.preCheckBalance,
      logger: options.logger,
    },
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveAdapter(option: AdapterOption, logger?: Logger): WalletAdapter {
  switch (option.type) {
    case 'coinbase':
      return new CoinbaseAdapter({
        apiKey: option.apiKey,
        walletId: option.walletId,
        network: option.network,
        logger,
      });

    case 'local':
      return new LocalSignerAdapter({
        keystorePath: option.keystorePath,
        passphrase: option.passphrase,
        rpcUrl: option.rpcUrl,
        network: option.network,
        logger,
      });

    case 'custom':
      return option.instance;
  }
}

function buildPolicyEngine(limits?: SpendLimits): PolicyEngine {
  const engine = new PolicyEngine();
  const currency = limits?.currency ?? 'USDC';

  const rules = [];
  const budgets = [];

  // perTx → blockAbove
  if (limits?.perTx != null) {
    rules.push(blockAbove(limits.perTx, currency));
  }

  // requireApprovalAbove → requireApprovalAbove
  if (limits?.requireApprovalAbove != null) {
    rules.push(requireApprovalAbove(limits.requireApprovalAbove, currency));
  }

  // Always end with allowAll (catch-all)
  rules.push(allowAll());

  // daily → budget
  if (limits?.daily != null) {
    budgets.push({ window: 'daily' as const, maxAmount: limits.daily, currency });
  }

  engine.loadPolicy({
    id: 'default' as PolicyId,
    name: 'Default',
    enabled: true,
    rules,
    budgets,
  });

  return engine;
}
