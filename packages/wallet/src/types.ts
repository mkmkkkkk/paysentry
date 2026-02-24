// =============================================================================
// @paysentry/wallet — Type Definitions
// Wallet-agnostic adapter layer: any wallet backend, one interface.
// =============================================================================

import type {
  AgentId,
  AgentTransaction,
  Logger,
  ApprovalHandler,
} from '@paysentry/core';

// ---------------------------------------------------------------------------
// WalletAdapter — the universal wallet interface
// ---------------------------------------------------------------------------

/**
 * WalletAdapter is the contract every wallet backend must implement.
 * PaySentry never touches private keys — it delegates signing to the adapter
 * ONLY after policy evaluation passes.
 *
 * Implementors: CoinbaseAdapter, LocalSignerAdapter, OpenfortAdapter, etc.
 */
export interface WalletAdapter {
  /** Human-readable adapter name (e.g., 'coinbase', 'local', 'openfort') */
  readonly name: string;

  /**
   * Get the wallet's balance for a given currency.
   * Returns the balance in the currency's smallest unit as a string
   * to avoid floating-point precision issues with large values.
   */
  getBalance(currency: string): Promise<WalletBalance>;

  /**
   * Sign and broadcast a transaction.
   * This is ONLY called after PolicyEngine approves the transaction.
   * The adapter must never be called directly by agent code.
   *
   * @param tx - The approved AgentTransaction
   * @returns Receipt with on-chain tx hash and status
   */
  signAndSend(tx: AgentTransaction): Promise<TransactionReceipt>;

  /**
   * Check the status of a previously submitted transaction.
   *
   * @param txHash - The on-chain transaction hash
   * @returns Current status of the transaction
   */
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;

  /**
   * Get the wallet address(es) managed by this adapter.
   */
  getAddresses(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Transaction Receipt
// ---------------------------------------------------------------------------

/** Result of a successful signAndSend call */
export interface TransactionReceipt {
  /** On-chain transaction hash */
  readonly txHash: string;

  /** Network the transaction was submitted on (e.g., 'base', 'base-sepolia') */
  readonly network: string;

  /** Whether the transaction was confirmed on-chain */
  readonly confirmed: boolean;

  /** Block number (if confirmed) */
  readonly blockNumber?: number;

  /** Gas/fee paid (human-readable string) */
  readonly fee?: string;

  /** ISO 8601 timestamp of submission */
  readonly submittedAt: string;

  /** ISO 8601 timestamp of confirmation (if confirmed) */
  readonly confirmedAt?: string;
}

/** On-chain transaction status */
export interface TransactionStatus {
  /** Current state */
  readonly state: 'pending' | 'confirmed' | 'failed' | 'not_found';

  /** Number of confirmations */
  readonly confirmations: number;

  /** Block number (if confirmed) */
  readonly blockNumber?: number;

  /** Error reason (if failed) */
  readonly failureReason?: string;
}

/** Wallet balance for a specific currency */
export interface WalletBalance {
  /** Currency identifier (e.g., 'USDC', 'ETH') */
  readonly currency: string;

  /** Balance as a human-readable string (e.g., '142.50') */
  readonly amount: string;

  /** Balance in smallest unit (e.g., wei, micro-cents) */
  readonly rawAmount: string;

  /** Number of decimals for this currency */
  readonly decimals: number;
}

// ---------------------------------------------------------------------------
// PaySentryWallet Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the PaySentryWallet orchestrator.
 */
export interface PaySentryWalletConfig {
  /** Logger instance */
  readonly logger?: Logger;

  /** Default agent ID when not specified in payment request */
  readonly defaultAgentId?: AgentId;

  /** Default currency (default: 'USDC') */
  readonly defaultCurrency?: string;

  /**
   * Handler called when a transaction requires human approval.
   * If not set, require_approval actions are treated as denials.
   */
  readonly approvalHandler?: ApprovalHandler;

  /**
   * Maximum time in ms to wait for approval before auto-denying.
   * Default: 300_000 (5 minutes).
   */
  readonly approvalTimeoutMs?: number;

  /**
   * If true, balance is checked before policy evaluation
   * to fail fast on insufficient funds. Default: true.
   */
  readonly preCheckBalance?: boolean;
}

// ---------------------------------------------------------------------------
// Payment Request — what agents submit
// ---------------------------------------------------------------------------

/**
 * A payment request from an agent.
 * This is the public-facing input to PaySentryWallet.executePayment().
 */
export interface PaymentRequest {
  /** Amount to pay */
  readonly amount: number;

  /** Currency (e.g., 'USDC') */
  readonly currency: string;

  /** Recipient address */
  readonly to: string;

  /** Human-readable reason for the payment */
  readonly reason: string;

  /** Agent making the request (uses default if omitted) */
  readonly agentId?: AgentId;

  /** Arbitrary metadata */
  readonly metadata?: Record<string, unknown>;
}

/** Result of a payment execution */
export interface PaymentResult {
  /** Overall outcome */
  readonly status: 'completed' | 'denied' | 'failed' | 'approval_timeout';

  /** Human-readable reason */
  readonly reason: string;

  /** Transaction hash (if completed) */
  readonly txHash?: string;

  /** Network (if completed) */
  readonly network?: string;

  /** The PaySentry transaction ID */
  readonly transactionId?: string;

  /** Policy action that was applied */
  readonly policyAction?: string;
}

// ---------------------------------------------------------------------------
// Coinbase Adapter Configuration
// ---------------------------------------------------------------------------

/** Configuration for CoinbaseAdapter */
export interface CoinbaseAdapterConfig {
  /** Coinbase Developer Platform API key */
  readonly apiKey: string;

  /** Coinbase wallet ID */
  readonly walletId: string;

  /** Network (default: 'base') */
  readonly network?: string;

  /** API base URL (default: 'https://api.developer.coinbase.com') */
  readonly baseUrl?: string;

  /** Request timeout in ms (default: 30_000) */
  readonly timeoutMs?: number;

  /** Logger */
  readonly logger?: Logger;
}

// ---------------------------------------------------------------------------
// Local Signer Configuration
// ---------------------------------------------------------------------------

/** Configuration for LocalSignerAdapter */
export interface LocalSignerAdapterConfig {
  /** Path to the encrypted keystore file */
  readonly keystorePath: string;

  /**
   * Passphrase to decrypt the keystore.
   * In production, this should come from an environment variable
   * or secrets manager — NEVER hardcoded.
   */
  readonly passphrase: string;

  /** Network (default: 'base') */
  readonly network?: string;

  /** RPC endpoint URL */
  readonly rpcUrl: string;

  /** Logger */
  readonly logger?: Logger;
}
