// =============================================================================
// MockX402 — Simulated x402 (HTTP 402 Payment Required) facilitator
// Mimics the behavior of a real x402 payment facilitator for testing
// =============================================================================

import type {
  AgentTransaction,
  MockPaymentResult,
  Logger,
} from '@paysentry/core';
import { generateId } from '@paysentry/core';

/** Configuration for the mock x402 facilitator */
export interface MockX402Config {
  /** Simulated network latency in milliseconds (default: 100) */
  readonly latencyMs?: number;

  /** Simulated failure rate, 0.0 to 1.0 (default: 0) */
  readonly failureRate?: number;

  /** Simulated settlement time in milliseconds (default: 1000) */
  readonly settlementMs?: number;

  /** Maximum amount allowed per transaction (default: Infinity) */
  readonly maxAmount?: number;

  /** Supported currencies (default: ['USDC', 'ETH']) */
  readonly supportedCurrencies?: readonly string[];

  /** Optional logger */
  readonly logger?: Logger;
}

/**
 * MockX402 simulates the x402 payment protocol (HTTP 402 Payment Required).
 * In production, x402 enables pay-per-request access to HTTP resources.
 * This mock provides deterministic or configurable behavior for testing.
 *
 * @example
 * ```ts
 * const x402 = new MockX402({ latencyMs: 50, failureRate: 0.1 });
 *
 * const result = await x402.processPayment(transaction);
 * if (result.success) {
 *   console.log(`Payment processed: ${result.txId}`);
 * }
 * ```
 */
export class MockX402 {
  private readonly config: Required<Pick<MockX402Config, 'latencyMs' | 'failureRate' | 'settlementMs' | 'maxAmount'>> & MockX402Config;
  private readonly supportedCurrencies: Set<string>;

  /** Track all processed payments for assertion in tests */
  readonly processedPayments: MockPaymentResult[] = [];

  /** Running balance of the mock facilitator */
  private balance: number = 0;

  constructor(config?: MockX402Config) {
    this.config = {
      latencyMs: config?.latencyMs ?? 100,
      failureRate: config?.failureRate ?? 0,
      settlementMs: config?.settlementMs ?? 1000,
      maxAmount: config?.maxAmount ?? Infinity,
      ...config,
    };
    this.supportedCurrencies = new Set(config?.supportedCurrencies ?? ['USDC', 'ETH']);
  }

  /**
   * Process a payment through the mock x402 facilitator.
   * Simulates network latency, validation, and settlement.
   */
  async processPayment(tx: AgentTransaction): Promise<MockPaymentResult> {
    // Simulate network latency
    await this.sleep(this.config.latencyMs);

    // Validate currency
    if (!this.supportedCurrencies.has(tx.currency)) {
      const result: MockPaymentResult = {
        success: false,
        txId: '',
        error: `Unsupported currency: ${tx.currency}. Supported: ${[...this.supportedCurrencies].join(', ')}`,
      };
      this.processedPayments.push(result);
      return result;
    }

    // Validate amount
    if (tx.amount > this.config.maxAmount) {
      const result: MockPaymentResult = {
        success: false,
        txId: '',
        error: `Amount $${tx.amount} exceeds maximum of $${this.config.maxAmount}`,
      };
      this.processedPayments.push(result);
      return result;
    }

    // Validate recipient looks like a URL (x402 targets HTTP endpoints)
    if (!tx.recipient.startsWith('http://') && !tx.recipient.startsWith('https://')) {
      const result: MockPaymentResult = {
        success: false,
        txId: '',
        error: `x402 requires an HTTP URL recipient. Got: ${tx.recipient}`,
      };
      this.processedPayments.push(result);
      return result;
    }

    // Simulate random failures
    if (Math.random() < this.config.failureRate) {
      const result: MockPaymentResult = {
        success: false,
        txId: '',
        error: 'Simulated x402 facilitator error: transaction failed',
      };
      this.processedPayments.push(result);
      return result;
    }

    // Success
    const txId = generateId('x402');
    this.balance += tx.amount;

    const result: MockPaymentResult = {
      success: true,
      txId,
      settlementMs: this.config.settlementMs,
    };

    this.processedPayments.push(result);

    this.config.logger?.info(`[MockX402] Payment processed: ${txId}`, {
      amount: tx.amount,
      currency: tx.currency,
      recipient: tx.recipient,
    });

    return result;
  }

  /**
   * Get the running balance of processed payments.
   */
  getBalance(): number {
    return this.balance;
  }

  /**
   * Reset the mock to initial state.
   */
  reset(): void {
    this.processedPayments.length = 0;
    this.balance = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
