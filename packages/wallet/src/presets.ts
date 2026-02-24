// =============================================================================
// Spend Limit Presets — sensible defaults for common use cases
//
// Usage:
//   createWallet({ adapter: ..., limits: presets.standard })
// =============================================================================

/** Spending limits configuration */
export interface SpendLimits {
  /** Max per-transaction amount (default: no limit) */
  readonly perTx?: number;
  /** Max daily spend (default: no limit) */
  readonly daily?: number;
  /** Amount above which human approval is required */
  readonly requireApprovalAbove?: number;
  /** Currency for all limits (default: 'USDC') */
  readonly currency?: string;
}

/**
 * Pre-configured spending limit profiles.
 *
 * - `conservative` — $25/tx, $100/day. Good for testing and low-risk agents.
 * - `standard` — $100/tx, $500/day, approval above $50. Good for production agents.
 * - `generous` — $1000/tx, $5000/day, approval above $500. For high-volume agents.
 * - `unlimited` — No caps. Use only in sandboxed/test environments.
 */
export const presets = {
  conservative: {
    perTx: 25,
    daily: 100,
    currency: 'USDC',
  },
  standard: {
    perTx: 100,
    daily: 500,
    requireApprovalAbove: 50,
    currency: 'USDC',
  },
  generous: {
    perTx: 1000,
    daily: 5000,
    requireApprovalAbove: 500,
    currency: 'USDC',
  },
  unlimited: {
    currency: 'USDC',
  },
} as const satisfies Record<string, SpendLimits>;
