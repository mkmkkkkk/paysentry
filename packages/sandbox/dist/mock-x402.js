// =============================================================================
// MockX402 — Simulated x402 (HTTP 402 Payment Required) facilitator
// Mimics the behavior of a real x402 payment facilitator for testing
// =============================================================================
import { generateId } from '@paysentry/core';
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
    config;
    supportedCurrencies;
    /** Track all processed payments for assertion in tests */
    processedPayments = [];
    /** Running balance of the mock facilitator */
    balance = 0;
    constructor(config) {
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
    async processPayment(tx) {
        // Simulate network latency
        await this.sleep(this.config.latencyMs);
        // Validate currency
        if (!this.supportedCurrencies.has(tx.currency)) {
            const result = {
                success: false,
                txId: '',
                error: `Unsupported currency: ${tx.currency}. Supported: ${[...this.supportedCurrencies].join(', ')}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Validate amount
        if (tx.amount > this.config.maxAmount) {
            const result = {
                success: false,
                txId: '',
                error: `Amount $${tx.amount} exceeds maximum of $${this.config.maxAmount}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Validate recipient looks like a URL (x402 targets HTTP endpoints)
        if (!tx.recipient.startsWith('http://') && !tx.recipient.startsWith('https://')) {
            const result = {
                success: false,
                txId: '',
                error: `x402 requires an HTTP URL recipient. Got: ${tx.recipient}`,
            };
            this.processedPayments.push(result);
            return result;
        }
        // Simulate random failures
        if (Math.random() < this.config.failureRate) {
            const result = {
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
        const result = {
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
    getBalance() {
        return this.balance;
    }
    /**
     * Reset the mock to initial state.
     */
    reset() {
        this.processedPayments.length = 0;
        this.balance = 0;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=mock-x402.js.map