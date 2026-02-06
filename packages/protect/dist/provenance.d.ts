import type { AgentTransaction, TransactionId, ProvenanceRecord, Logger } from '@paysentry/core';
/**
 * TransactionProvenance maintains a complete, immutable audit trail
 * for every transaction. Each stage of the pipeline (intent, policy check,
 * approval, execution, settlement, dispute) creates a provenance record.
 *
 * This forms the evidentiary basis for dispute resolution and liability
 * attribution.
 *
 * @example
 * ```ts
 * const provenance = new TransactionProvenance();
 *
 * // Record each stage
 * provenance.recordIntent(tx, { originalPrompt: 'Buy me a coffee' });
 * provenance.recordPolicyCheck(tx.id, 'pass', { policyId: 'default' });
 * provenance.recordExecution(tx.id, 'pass', { txHash: '0xabc...' });
 * provenance.recordSettlement(tx.id, 'pass', { confirmedAt: '2026-01-01' });
 *
 * // Query the full chain
 * const chain = provenance.getChain(tx.id);
 * // chain = [intent, policy_check, execution, settlement]
 * ```
 */
export declare class TransactionProvenance {
    /** Storage: transactionId -> ordered list of provenance records */
    private readonly chains;
    private readonly logger?;
    constructor(options?: {
        logger?: Logger;
    });
    /**
     * Record the initial intent stage — when the agent declares what it wants to pay.
     */
    recordIntent(tx: AgentTransaction, details?: Record<string, unknown>): ProvenanceRecord;
    /**
     * Record a policy check stage — whether the policy engine approved/denied.
     */
    recordPolicyCheck(txId: TransactionId, outcome: 'pass' | 'fail', details?: Record<string, unknown>): ProvenanceRecord;
    /**
     * Record an approval stage — human or automated approval decision.
     */
    recordApproval(txId: TransactionId, outcome: 'pass' | 'fail', details?: Record<string, unknown>): ProvenanceRecord;
    /**
     * Record the execution stage — when the payment is actually submitted.
     */
    recordExecution(txId: TransactionId, outcome: 'pass' | 'fail', details?: Record<string, unknown>): ProvenanceRecord;
    /**
     * Record the settlement stage — when funds are confirmed received.
     */
    recordSettlement(txId: TransactionId, outcome: 'pass' | 'fail', details?: Record<string, unknown>): ProvenanceRecord;
    /**
     * Record a dispute stage — when a dispute is filed against this transaction.
     */
    recordDispute(txId: TransactionId, details?: Record<string, unknown>): ProvenanceRecord;
    /**
     * Get the full provenance chain for a transaction.
     * Returns records in chronological order.
     */
    getChain(txId: TransactionId): readonly ProvenanceRecord[];
    /**
     * Check if a transaction has a complete provenance chain
     * (intent through settlement or dispute).
     */
    isComplete(txId: TransactionId): boolean;
    /**
     * Get the last recorded stage for a transaction.
     */
    getLastStage(txId: TransactionId): ProvenanceRecord | undefined;
    /**
     * Get all transaction IDs with provenance records.
     */
    get transactionIds(): TransactionId[];
    /**
     * Get the total number of provenance records across all transactions.
     */
    get totalRecords(): number;
    private addRecord;
}
//# sourceMappingURL=provenance.d.ts.map