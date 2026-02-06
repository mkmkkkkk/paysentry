// =============================================================================
// RecoveryEngine — Automated refund and chargeback flows
// Handles the mechanical process of recovering funds after dispute resolution
// =============================================================================
import { generateId } from '@paysentry/core';
/**
 * RecoveryEngine automates the process of recovering funds after
 * a dispute has been resolved in favor of the agent. It manages
 * refund queues, retry logic, and settlement confirmation.
 *
 * @example
 * ```ts
 * const recovery = new RecoveryEngine({
 *   disputes: disputeManager,
 *   executor: async (action) => {
 *     // Execute the actual refund via the payment protocol
 *     const result = await protocolRefund(action.transactionId, action.amount);
 *     return { success: result.ok, refundTxId: result.txId };
 *   },
 * });
 *
 * // Initiate recovery for a resolved dispute
 * const action = recovery.initiate(dispute.id);
 *
 * // Process the recovery queue
 * await recovery.processQueue();
 * ```
 */
export class RecoveryEngine {
    /** All recovery actions */
    actions = new Map();
    /** Index: disputeId -> recoveryId */
    byDispute = new Map();
    /** Processing queue (FIFO) */
    queue = [];
    /** Maximum retry attempts */
    maxRetries;
    /** Retry delay in milliseconds */
    retryDelayMs;
    disputes;
    executor;
    logger;
    constructor(options) {
        this.disputes = options.disputes;
        this.executor = options.executor;
        this.maxRetries = options.maxRetries ?? 3;
        this.retryDelayMs = options.retryDelayMs ?? 5000;
        this.logger = options.logger;
    }
    /**
     * Initiate a recovery action for a resolved dispute.
     * The dispute must be in a resolved state that warrants a refund.
     */
    initiate(disputeId) {
        const dispute = this.disputes.get(disputeId);
        if (!dispute) {
            throw new Error(`Dispute ${disputeId} not found`);
        }
        if (dispute.status !== 'resolved_refunded' && dispute.status !== 'resolved_partial') {
            throw new Error(`Cannot initiate recovery for dispute ${disputeId} with status "${dispute.status}". ` +
                `Dispute must be resolved with refund or partial refund.`);
        }
        // Check for existing recovery
        const existingId = this.byDispute.get(disputeId);
        if (existingId) {
            const existing = this.actions.get(existingId);
            if (existing && existing.status !== 'failed' && existing.status !== 'cancelled') {
                throw new Error(`Active recovery ${existingId} already exists for dispute ${disputeId}`);
            }
        }
        const amount = dispute.resolvedAmount ?? dispute.requestedAmount;
        const recoveryType = dispute.status === 'resolved_partial' ? 'partial_refund' : 'full_refund';
        const now = new Date().toISOString();
        const action = {
            id: generateId('rcv'),
            disputeId,
            transactionId: dispute.transactionId,
            agentId: dispute.agentId,
            type: recoveryType,
            amount,
            currency: 'USDC', // Default; could be pulled from transaction
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
        this.actions.set(action.id, action);
        this.byDispute.set(disputeId, action.id);
        this.queue.push(action.id);
        this.logger?.info(`[RecoveryEngine] Initiated ${recoveryType} of $${amount} for dispute ${disputeId}`);
        return action;
    }
    /**
     * Process all pending recovery actions in the queue.
     * Each action is attempted with retry logic.
     */
    async processQueue() {
        const processed = [];
        while (this.queue.length > 0) {
            const actionId = this.queue.shift();
            const action = this.actions.get(actionId);
            if (!action || action.status === 'cancelled')
                continue;
            const result = await this.executeWithRetry(action);
            processed.push(result);
        }
        return processed;
    }
    /**
     * Cancel a pending recovery action.
     */
    cancel(recoveryId) {
        const action = this.actions.get(recoveryId);
        if (!action) {
            throw new Error(`Recovery action ${recoveryId} not found`);
        }
        if (action.status !== 'pending') {
            throw new Error(`Cannot cancel recovery ${recoveryId} with status "${action.status}"`);
        }
        action.status = 'cancelled';
        action.updatedAt = new Date().toISOString();
        this.logger?.info(`[RecoveryEngine] Cancelled recovery ${recoveryId}`);
        return action;
    }
    /**
     * Get a recovery action by ID.
     */
    get(recoveryId) {
        return this.actions.get(recoveryId);
    }
    /**
     * Get the recovery action for a specific dispute.
     */
    getByDispute(disputeId) {
        const recoveryId = this.byDispute.get(disputeId);
        return recoveryId ? this.actions.get(recoveryId) : undefined;
    }
    /**
     * Get all recovery actions, optionally filtered by status.
     */
    getAll(status) {
        const all = [...this.actions.values()];
        return status ? all.filter((a) => a.status === status) : all;
    }
    /**
     * Get recovery statistics.
     */
    getStats() {
        let pending = 0;
        let processing = 0;
        let completed = 0;
        let failed = 0;
        let cancelled = 0;
        let totalRecovered = 0;
        for (const action of this.actions.values()) {
            switch (action.status) {
                case 'pending':
                    pending++;
                    break;
                case 'processing':
                    processing++;
                    break;
                case 'completed':
                    completed++;
                    totalRecovered += action.amount;
                    break;
                case 'failed':
                    failed++;
                    break;
                case 'cancelled':
                    cancelled++;
                    break;
            }
        }
        return {
            total: this.actions.size,
            pending,
            processing,
            completed,
            failed,
            cancelled,
            totalRecovered,
        };
    }
    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------
    async executeWithRetry(action) {
        action.status = 'processing';
        action.updatedAt = new Date().toISOString();
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            this.logger?.info(`[RecoveryEngine] Executing recovery ${action.id}, attempt ${attempt}/${this.maxRetries}`);
            try {
                const result = await this.executor(action);
                if (result.success) {
                    action.status = 'completed';
                    action.refundTxId = result.refundTxId;
                    action.completedAt = new Date().toISOString();
                    action.updatedAt = action.completedAt;
                    this.logger?.info(`[RecoveryEngine] Recovery ${action.id} completed: refundTxId=${result.refundTxId}`);
                    return action;
                }
                action.error = result.error ?? 'Refund execution returned failure';
            }
            catch (err) {
                action.error = err instanceof Error ? err.message : String(err);
            }
            // Wait before retrying (skip wait on last attempt)
            if (attempt < this.maxRetries) {
                await this.sleep(this.retryDelayMs * attempt);
            }
        }
        // All retries exhausted
        action.status = 'failed';
        action.updatedAt = new Date().toISOString();
        this.logger?.error(`[RecoveryEngine] Recovery ${action.id} failed after ${this.maxRetries} attempts: ${action.error}`);
        return action;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=recovery.js.map