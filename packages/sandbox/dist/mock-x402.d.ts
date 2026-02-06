import type { AgentTransaction, MockPaymentResult, Logger } from '@paysentry/core';
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
export declare class MockX402 {
    private readonly config;
    private readonly supportedCurrencies;
    /** Track all processed payments for assertion in tests */
    readonly processedPayments: MockPaymentResult[];
    /** Running balance of the mock facilitator */
    private balance;
    constructor(config?: MockX402Config);
    /**
     * Process a payment through the mock x402 facilitator.
     * Simulates network latency, validation, and settlement.
     */
    processPayment(tx: AgentTransaction): Promise<MockPaymentResult>;
    /**
     * Get the running balance of processed payments.
     */
    getBalance(): number;
    /**
     * Reset the mock to initial state.
     */
    reset(): void;
    private sleep;
}
//# sourceMappingURL=mock-x402.d.ts.map