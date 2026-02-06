import type { DisputeCase, DisputeEvidence, DisputeId, DisputeStatus, TransactionId, AgentId, LiabilityAttribution, Logger } from '@paysentry/core';
import type { TransactionProvenance } from './provenance.js';
/** Options for filing a new dispute */
export interface FileDisputeInput {
    /** Transaction being disputed */
    readonly transactionId: TransactionId;
    /** Agent filing the dispute */
    readonly agentId: AgentId;
    /** Reason for the dispute */
    readonly reason: string;
    /** Amount requested for refund */
    readonly requestedAmount: number;
    /** Initial evidence (optional) */
    readonly evidence?: DisputeEvidence[];
}
/** Filter for querying disputes */
export interface DisputeFilter {
    /** Filter by status */
    readonly status?: DisputeStatus;
    /** Filter by agent */
    readonly agentId?: AgentId;
    /** Filter by transaction */
    readonly transactionId?: TransactionId;
    /** Filter by liability */
    readonly liability?: LiabilityAttribution;
    /** Maximum results */
    readonly limit?: number;
}
/** Callback for dispute status changes */
export type DisputeListener = (dispute: DisputeCase, previousStatus: DisputeStatus) => void | Promise<void>;
/**
 * DisputeManager handles the full lifecycle of payment disputes:
 * filing, investigation, evidence collection, liability attribution,
 * and resolution.
 *
 * It integrates with TransactionProvenance to automatically pull
 * the transaction's audit trail as evidence.
 *
 * @example
 * ```ts
 * const disputes = new DisputeManager({ provenance });
 *
 * // File a dispute
 * const dispute = disputes.file({
 *   transactionId: tx.id,
 *   agentId: tx.agentId,
 *   reason: 'Service not delivered after payment',
 *   requestedAmount: tx.amount,
 * });
 *
 * // Add evidence
 * disputes.addEvidence(dispute.id, {
 *   type: 'user_statement',
 *   description: 'Agent completed payment but received 404 from service',
 *   data: { httpStatus: 404, url: 'https://api.service.com/resource' },
 *   addedAt: new Date().toISOString(),
 * });
 *
 * // Resolve
 * disputes.resolve(dispute.id, {
 *   status: 'resolved_refunded',
 *   liability: 'service_provider',
 *   resolvedAmount: tx.amount,
 * });
 * ```
 */
export declare class DisputeManager {
    /** All disputes, keyed by dispute ID */
    private readonly disputes;
    /** Index: transactionId -> disputeId */
    private readonly byTransaction;
    /** Index: agentId -> set of dispute IDs */
    private readonly byAgent;
    /** Status change listeners */
    private readonly listeners;
    private readonly provenance?;
    private readonly logger?;
    constructor(options?: {
        provenance?: TransactionProvenance;
        logger?: Logger;
    });
    /**
     * File a new dispute case.
     * Automatically pulls provenance records as initial evidence if available.
     */
    file(input: FileDisputeInput): DisputeCase;
    /**
     * Add evidence to an existing dispute.
     */
    addEvidence(disputeId: DisputeId, evidence: DisputeEvidence): void;
    /**
     * Update the status of a dispute (e.g., open -> investigating).
     */
    updateStatus(disputeId: DisputeId, newStatus: DisputeStatus): void;
    /**
     * Resolve a dispute with a final determination.
     */
    resolve(disputeId: DisputeId, resolution: {
        status: 'resolved_refunded' | 'resolved_denied' | 'resolved_partial';
        liability: LiabilityAttribution;
        resolvedAmount?: number;
    }): DisputeCase;
    /**
     * Get a dispute by ID.
     */
    get(disputeId: DisputeId): DisputeCase | undefined;
    /**
     * Get the dispute associated with a transaction.
     */
    getByTransaction(txId: TransactionId): DisputeCase | undefined;
    /**
     * Get all disputes for an agent.
     */
    getByAgent(agentId: AgentId): DisputeCase[];
    /**
     * Query disputes with filtering.
     */
    query(filter: DisputeFilter): DisputeCase[];
    /**
     * Register a listener for dispute status changes.
     */
    onStatusChange(listener: DisputeListener): void;
    /**
     * Get summary statistics for disputes.
     */
    getStats(): {
        total: number;
        open: number;
        investigating: number;
        resolved: number;
        escalated: number;
        totalRequestedAmount: number;
        totalResolvedAmount: number;
    };
    private isClosed;
    private notifyListeners;
}
//# sourceMappingURL=disputes.d.ts.map