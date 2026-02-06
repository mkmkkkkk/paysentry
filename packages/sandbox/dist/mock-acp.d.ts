import type { AgentTransaction, MockPaymentResult, Logger } from '@paysentry/core';
/** Configuration for the mock ACP endpoint */
export interface MockACPConfig {
    /** Simulated processing latency in milliseconds (default: 200) */
    readonly latencyMs?: number;
    /** Simulated failure rate, 0.0 to 1.0 (default: 0) */
    readonly failureRate?: number;
    /** Simulated settlement time in milliseconds (default: 2000) */
    readonly settlementMs?: number;
    /** Merchants that will always decline (for testing) */
    readonly declinedMerchants?: readonly string[];
    /** Optional logger */
    readonly logger?: Logger;
}
/** Payment method in the mock ACP system */
export interface MockPaymentMethod {
    /** Method identifier */
    readonly id: string;
    /** Type of payment method */
    readonly type: 'card' | 'bank_transfer' | 'wallet';
    /** Whether this method is active */
    readonly active: boolean;
    /** Available balance (for wallet type) */
    readonly balance?: number;
}
/**
 * MockACP simulates the Agent Commerce Protocol, which handles
 * traditional payment flows (similar to Stripe) for agent-to-merchant
 * transactions.
 *
 * @example
 * ```ts
 * const acp = new MockACP({
 *   declinedMerchants: ['merchant:blacklisted-shop'],
 * });
 *
 * acp.addPaymentMethod({
 *   id: 'pm_default',
 *   type: 'wallet',
 *   active: true,
 *   balance: 1000,
 * });
 *
 * const result = await acp.processPayment(transaction);
 * ```
 */
export declare class MockACP {
    private readonly config;
    private readonly declinedMerchants;
    private readonly paymentMethods;
    /** Track all processed payments */
    readonly processedPayments: MockPaymentResult[];
    /** Transaction history */
    readonly transactionLog: Array<{
        readonly txId: string;
        readonly amount: number;
        readonly currency: string;
        readonly merchant: string;
        readonly timestamp: string;
    }>;
    constructor(config?: MockACPConfig);
    /**
     * Add a payment method to the mock ACP.
     */
    addPaymentMethod(method: MockPaymentMethod): void;
    /**
     * Process a payment through the mock ACP.
     */
    processPayment(tx: AgentTransaction): Promise<MockPaymentResult>;
    /**
     * Get all payment methods.
     */
    getPaymentMethods(): MockPaymentMethod[];
    /**
     * Reset the mock to initial state.
     */
    reset(): void;
    private sleep;
}
//# sourceMappingURL=mock-acp.d.ts.map