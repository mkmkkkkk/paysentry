import type { AgentTransaction, AgentId, MockPaymentResult, Logger } from '@paysentry/core';
/** A payment mandate between two agents */
export interface PaymentMandate {
    /** Unique mandate identifier */
    readonly id: string;
    /** Agent granting the mandate (payer) */
    readonly grantor: AgentId;
    /** Agent receiving payments (payee) */
    readonly grantee: AgentId;
    /** Maximum amount per transaction */
    readonly maxPerTransaction: number;
    /** Maximum cumulative amount */
    readonly maxCumulative: number;
    /** Currency */
    readonly currency: string;
    /** ISO 8601 expiration date */
    readonly expiresAt: string;
    /** Whether the mandate is active */
    active: boolean;
    /** Amount already spent under this mandate */
    spent: number;
}
/** Configuration for the mock AP2 issuer */
export interface MockAP2Config {
    /** Simulated latency in milliseconds (default: 150) */
    readonly latencyMs?: number;
    /** Simulated failure rate, 0.0 to 1.0 (default: 0) */
    readonly failureRate?: number;
    /** Optional logger */
    readonly logger?: Logger;
}
/**
 * MockAP2 simulates the Agent-to-Agent Payment Protocol, which enables
 * agents to issue payment mandates to other agents. A mandate grants
 * permission to pull funds up to specified limits.
 *
 * @example
 * ```ts
 * const ap2 = new MockAP2();
 *
 * // Create a mandate: agent-1 authorizes agent-2 to spend up to $100
 * const mandate = ap2.createMandate({
 *   grantor: 'agent-1' as AgentId,
 *   grantee: 'agent-2' as AgentId,
 *   maxPerTransaction: 10,
 *   maxCumulative: 100,
 *   currency: 'USDC',
 *   expiresAt: new Date(Date.now() + 86400000).toISOString(),
 * });
 *
 * // Process a payment under the mandate
 * const result = await ap2.processPayment(transaction, mandate.id);
 * ```
 */
export declare class MockAP2 {
    private readonly config;
    private readonly mandates;
    /** Track all processed payments */
    readonly processedPayments: MockPaymentResult[];
    constructor(config?: MockAP2Config);
    /**
     * Create a new payment mandate.
     */
    createMandate(input: Omit<PaymentMandate, 'id' | 'active' | 'spent'>): PaymentMandate;
    /**
     * Process a payment under a specific mandate.
     */
    processPayment(tx: AgentTransaction, mandateId?: string): Promise<MockPaymentResult>;
    /**
     * Revoke a mandate.
     */
    revokeMandate(mandateId: string): boolean;
    /**
     * Get a mandate by ID.
     */
    getMandate(mandateId: string): PaymentMandate | undefined;
    /**
     * Get all mandates for a given grantor or grantee.
     */
    getMandates(agentId: AgentId, role: 'grantor' | 'grantee'): PaymentMandate[];
    /**
     * Reset the mock to initial state.
     */
    reset(): void;
    private findMandate;
    private sleep;
}
//# sourceMappingURL=mock-ap2.d.ts.map