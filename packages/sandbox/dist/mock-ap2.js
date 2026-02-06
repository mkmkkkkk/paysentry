// =============================================================================
// MockAP2 — Simulated Agent-to-Agent Payment Protocol (AP2) mandate issuer
// Handles recurring payment mandates between AI agents
// =============================================================================
import { generateId } from '@paysentry/core';
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
export class MockAP2 {
    config;
    mandates = new Map();
    /** Track all processed payments */
    processedPayments = [];
    constructor(config) {
        this.config = {
            latencyMs: config?.latencyMs ?? 150,
            failureRate: config?.failureRate ?? 0,
            ...config,
        };
    }
    /**
     * Create a new payment mandate.
     */
    createMandate(input) {
        const mandate = {
            ...input,
            id: generateId('mdt'),
            active: true,
            spent: 0,
        };
        this.mandates.set(mandate.id, mandate);
        this.config.logger?.info(`[MockAP2] Created mandate ${mandate.id}`, {
            grantor: mandate.grantor,
            grantee: mandate.grantee,
            maxCumulative: mandate.maxCumulative,
        });
        return mandate;
    }
    /**
     * Process a payment under a specific mandate.
     */
    async processPayment(tx, mandateId) {
        await this.sleep(this.config.latencyMs);
        // Find applicable mandate
        const mandate = mandateId
            ? this.mandates.get(mandateId)
            : this.findMandate(tx);
        if (!mandate) {
            const result = {
                success: false,
                txId: '',
                error: mandateId
                    ? `Mandate ${mandateId} not found`
                    : `No active mandate found for ${tx.agentId} -> ${tx.recipient}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Validate mandate is active
        if (!mandate.active) {
            const result = {
                success: false,
                txId: '',
                error: `Mandate ${mandate.id} is no longer active`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Check expiration
        if (new Date(mandate.expiresAt) < new Date()) {
            mandate.active = false;
            const result = {
                success: false,
                txId: '',
                error: `Mandate ${mandate.id} has expired`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Check currency match
        if (mandate.currency !== tx.currency) {
            const result = {
                success: false,
                txId: '',
                error: `Currency mismatch: mandate is ${mandate.currency}, transaction is ${tx.currency}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Check per-transaction limit
        if (tx.amount > mandate.maxPerTransaction) {
            const result = {
                success: false,
                txId: '',
                error: `Amount $${tx.amount} exceeds mandate per-transaction limit of $${mandate.maxPerTransaction}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Check cumulative limit
        if (mandate.spent + tx.amount > mandate.maxCumulative) {
            const result = {
                success: false,
                txId: '',
                error: `Cumulative spend would reach $${mandate.spent + tx.amount}, exceeding mandate limit of $${mandate.maxCumulative}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Simulate random failures
        if (Math.random() < this.config.failureRate) {
            const result = {
                success: false,
                txId: '',
                error: 'Simulated AP2 network error',
            };
            this.processedPayments.push(result);
            return result;
        }
        // Success — update mandate spend tracking
        mandate.spent += tx.amount;
        const txId = generateId('ap2');
        const result = {
            success: true,
            txId,
            settlementMs: 500,
        };
        this.processedPayments.push(result);
        this.config.logger?.info(`[MockAP2] Payment processed under mandate ${mandate.id}: ${txId}`, {
            amount: tx.amount,
            mandateSpent: mandate.spent,
            mandateRemaining: mandate.maxCumulative - mandate.spent,
        });
        return result;
    }
    /**
     * Revoke a mandate.
     */
    revokeMandate(mandateId) {
        const mandate = this.mandates.get(mandateId);
        if (!mandate)
            return false;
        mandate.active = false;
        this.config.logger?.info(`[MockAP2] Revoked mandate ${mandateId}`);
        return true;
    }
    /**
     * Get a mandate by ID.
     */
    getMandate(mandateId) {
        return this.mandates.get(mandateId);
    }
    /**
     * Get all mandates for a given grantor or grantee.
     */
    getMandates(agentId, role) {
        return [...this.mandates.values()].filter((m) => role === 'grantor' ? m.grantor === agentId : m.grantee === agentId);
    }
    /**
     * Reset the mock to initial state.
     */
    reset() {
        this.mandates.clear();
        this.processedPayments.length = 0;
    }
    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------
    findMandate(tx) {
        // Find an active mandate where the tx agent is the grantee
        // and the tx recipient matches the grantor
        return [...this.mandates.values()].find((m) => m.active &&
            m.grantee === tx.agentId &&
            new Date(m.expiresAt) > new Date());
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=mock-ap2.js.map