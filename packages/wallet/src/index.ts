// =============================================================================
// @paysentry/wallet — Public API
// Wallet-agnostic adapter layer for PaySentry.
// Plug any wallet backend behind PaySentry policy controls.
// =============================================================================

// Orchestrator
export { PaySentryWallet } from './paysentry-wallet.js';

// Adapters
export { CoinbaseAdapter } from './coinbase-adapter.js';
export { LocalSignerAdapter } from './local-signer-adapter.js';

// Types
export type {
  // Core interface
  WalletAdapter,
  WalletBalance,
  TransactionReceipt,
  TransactionStatus,

  // Orchestrator config
  PaySentryWalletConfig,
  PaymentRequest,
  PaymentResult,

  // Adapter configs
  CoinbaseAdapterConfig,
  LocalSignerAdapterConfig,
} from './types.js';
