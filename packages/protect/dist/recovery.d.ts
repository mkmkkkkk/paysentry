import type { DisputeId, TransactionId, AgentId, Logger } from '@paysentry/core';
import type { DisputeManager } from './disputes.js';
/** Status of a recovery attempt */
export type RecoveryStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
/** Type of recovery action */
export type RecoveryType = 'full_refund' | 'partial_refund' | 'chargeback' | 'credit';
/** A single recovery action */
export interface RecoveryAction {
    /** Unique recovery ID */
    readonly id: string;
    /** Associated dispute */
    readonly disputeId: DisputeId;
    /** Original transaction */
    readonly transactionId: TransactionId;
    /** Agent receiving the recovery */
    readonly agentId: AgentId;
    /** Type of recovery */
    readonly type: RecoveryType;
    /** Amount to recover */
    readonly amount: number;
    /** Currency */
    readonly currency: string;
    /** Current status */
    status: RecoveryStatus;
    /** ISO 8601 timestamp of creation */
    readonly createdAt: string;
    /** ISO 8601 timestamp of last update */
    updatedAt: string;
    /** ISO 8601 timestamp of completion */
    completedAt?: string;
    /** Protocol-specific refund transaction ID */
    refundTxId?: string;
    /** Error message if failed */
    error?: string;
}
/** Handler that executes the actual refund on the protocol level */
export type RefundExecutor = (action: RecoveryAction) => Promise<{
    success: boolean;
    refundTxId?: string;
    error?: string;
}>;
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
export declare class RecoveryEngine {
    /** All recovery actions */
    private readonly actions;
    /** Index: disputeId -> recoveryId */
    private readonly byDispute;
    /** Processing queue (FIFO) */
    private readonly queue;
    /** Maximum retry attempts */
    private readonly maxRetries;
    /** Retry delay in milliseconds */
    private readonly retryDelayMs;
    private readonly disputes;
    private readonly executor;
    private readonly logger?;
    constructor(options: {
        disputes: DisputeManager;
        executor: RefundExecutor;
        maxRetries?: number;
        retryDelayMs?: number;
        logger?: Logger;
    });
    /**
     * Initiate a recovery action for a resolved dispute.
     * The dispute must be in a resolved state that warrants a refund.
     */
    initiate(disputeId: DisputeId): RecoveryAction;
    /**
     * Process all pending recovery actions in the queue.
     * Each action is attempted with retry logic.
     */
    processQueue(): Promise<RecoveryAction[]>;
    /**
     * Cancel a pending recovery action.
     */
    cancel(recoveryId: string): RecoveryAction;
    /**
     * Get a recovery action by ID.
     */
    get(recoveryId: string): RecoveryAction | undefined;
    /**
     * Get the recovery action for a specific dispute.
     */
    getByDispute(disputeId: DisputeId): RecoveryAction | undefined;
    /**
     * Get all recovery actions, optionally filtered by status.
     */
    getAll(status?: RecoveryStatus): RecoveryAction[];
    /**
     * Get recovery statistics.
     */
    getStats(): {
        total: number;
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        cancelled: number;
        totalRecovered: number;
    };
    private executeWithRetry;
    private sleep;
}
//# sourceMappingURL=recovery.d.ts.map