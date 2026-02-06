// =============================================================================
// MockACP — Simulated Agent Commerce Protocol / Stripe endpoint
// Mimics traditional payment processing (card, subscription, one-time)
// =============================================================================
import { generateId } from '@paysentry/core';
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
export class MockACP {
    config;
    declinedMerchants;
    paymentMethods = new Map();
    /** Track all processed payments */
    processedPayments = [];
    /** Transaction history */
    transactionLog = [];
    constructor(config) {
        this.config = {
            latencyMs: config?.latencyMs ?? 200,
            failureRate: config?.failureRate ?? 0,
            settlementMs: config?.settlementMs ?? 2000,
            ...config,
        };
        this.declinedMerchants = new Set(config?.declinedMerchants ?? []);
    }
    /**
     * Add a payment method to the mock ACP.
     */
    addPaymentMethod(method) {
        this.paymentMethods.set(method.id, method);
    }
    /**
     * Process a payment through the mock ACP.
     */
    async processPayment(tx) {
        await this.sleep(this.config.latencyMs);
        // Check for declined merchants
        if (this.declinedMerchants.has(tx.recipient)) {
            const result = {
                success: false,
                txId: '',
                error: `Merchant "${tx.recipient}" has been declined`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Validate we have at least one active payment method
        const activeMethods = [...this.paymentMethods.values()].filter((m) => m.active);
        if (activeMethods.length === 0) {
            const result = {
                success: false,
                txId: '',
                error: 'No active payment methods available',
            };
            this.processedPayments.push(result);
            return result;
        }
        // Check wallet balance if applicable
        const walletMethod = activeMethods.find((m) => m.type === 'wallet');
        if (walletMethod && walletMethod.balance !== undefined && walletMethod.balance < tx.amount) {
            const result = {
                success: false,
                txId: '',
                error: `Insufficient wallet balance: $${walletMethod.balance} < $${tx.amount}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Simulate random failures
        if (Math.random() < this.config.failureRate) {
            const result = {
                success: false,
                txId: '',
                error: 'Simulated ACP processing error: payment declined',
            };
            this.processedPayments.push(result);
            return result;
        }
        // Success
        const txId = generateId('acp');
        this.transactionLog.push({
            txId,
            amount: tx.amount,
            currency: tx.currency,
            merchant: tx.recipient,
            timestamp: new Date().toISOString(),
        });
        const result = {
            success: true,
            txId,
            settlementMs: this.config.settlementMs,
        };
        this.processedPayments.push(result);
        this.config.logger?.info(`[MockACP] Payment processed: ${txId}`, {
            amount: tx.amount,
            merchant: tx.recipient,
        });
        return result;
    }
    /**
     * Get all payment methods.
     */
    getPaymentMethods() {
        return [...this.paymentMethods.values()];
    }
    /**
     * Reset the mock to initial state.
     */
    reset() {
        this.processedPayments.length = 0;
        this.transactionLog.length = 0;
        this.paymentMethods.clear();
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=mock-acp.js.map