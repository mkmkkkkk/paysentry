// =============================================================================
// TransactionProvenance — Full audit trail from intent to settlement
// Records every step of the transaction lifecycle for accountability
// =============================================================================

import type {
  AgentTransaction,
  TransactionId,
  ProvenanceRecord,
  Logger,
} from '@paysentry/core';

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
export class TransactionProvenance {
  /** Storage: transactionId -> ordered list of provenance records */
  private readonly chains: Map<TransactionId, ProvenanceRecord[]> = new Map();

  private readonly logger?: Logger;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger;
  }

  /**
   * Record the initial intent stage — when the agent declares what it wants to pay.
   */
  recordIntent(
    tx: AgentTransaction,
    details: Record<string, unknown> = {}
  ): ProvenanceRecord {
    return this.addRecord(tx.id, {
      transactionId: tx.id,
      stage: 'intent',
      timestamp: new Date().toISOString(),
      action: `Agent ${tx.agentId} intends to pay ${tx.amount} ${tx.currency} to ${tx.recipient}`,
      outcome: 'pass',
      details: {
        agentId: tx.agentId,
        recipient: tx.recipient,
        amount: tx.amount,
        currency: tx.currency,
        purpose: tx.purpose,
        protocol: tx.protocol,
        ...details,
      },
    });
  }

  /**
   * Record a policy check stage — whether the policy engine approved/denied.
   */
  recordPolicyCheck(
    txId: TransactionId,
    outcome: 'pass' | 'fail',
    details: Record<string, unknown> = {}
  ): ProvenanceRecord {
    return this.addRecord(txId, {
      transactionId: txId,
      stage: 'policy_check',
      timestamp: new Date().toISOString(),
      action: outcome === 'pass' ? 'Policy check passed' : 'Policy check failed',
      outcome,
      details,
    });
  }

  /**
   * Record an approval stage — human or automated approval decision.
   */
  recordApproval(
    txId: TransactionId,
    outcome: 'pass' | 'fail',
    details: Record<string, unknown> = {}
  ): ProvenanceRecord {
    return this.addRecord(txId, {
      transactionId: txId,
      stage: 'approval',
      timestamp: new Date().toISOString(),
      action: outcome === 'pass' ? 'Transaction approved' : 'Transaction rejected',
      outcome,
      details,
    });
  }

  /**
   * Record the execution stage — when the payment is actually submitted.
   */
  recordExecution(
    txId: TransactionId,
    outcome: 'pass' | 'fail',
    details: Record<string, unknown> = {}
  ): ProvenanceRecord {
    return this.addRecord(txId, {
      transactionId: txId,
      stage: 'execution',
      timestamp: new Date().toISOString(),
      action: outcome === 'pass' ? 'Payment executed successfully' : 'Payment execution failed',
      outcome,
      details,
    });
  }

  /**
   * Record the settlement stage — when funds are confirmed received.
   */
  recordSettlement(
    txId: TransactionId,
    outcome: 'pass' | 'fail',
    details: Record<string, unknown> = {}
  ): ProvenanceRecord {
    return this.addRecord(txId, {
      transactionId: txId,
      stage: 'settlement',
      timestamp: new Date().toISOString(),
      action: outcome === 'pass' ? 'Payment settled and confirmed' : 'Settlement failed',
      outcome,
      details,
    });
  }

  /**
   * Record a dispute stage — when a dispute is filed against this transaction.
   */
  recordDispute(
    txId: TransactionId,
    details: Record<string, unknown> = {}
  ): ProvenanceRecord {
    return this.addRecord(txId, {
      transactionId: txId,
      stage: 'dispute',
      timestamp: new Date().toISOString(),
      action: 'Dispute filed against transaction',
      outcome: 'pending',
      details,
    });
  }

  /**
   * Get the full provenance chain for a transaction.
   * Returns records in chronological order.
   */
  getChain(txId: TransactionId): readonly ProvenanceRecord[] {
    return this.chains.get(txId) ?? [];
  }

  /**
   * Check if a transaction has a complete provenance chain
   * (intent through settlement or dispute).
   */
  isComplete(txId: TransactionId): boolean {
    const chain = this.chains.get(txId);
    if (!chain || chain.length === 0) return false;

    const stages = new Set(chain.map((r) => r.stage));
    return stages.has('intent') && (stages.has('settlement') || stages.has('dispute'));
  }

  /**
   * Get the last recorded stage for a transaction.
   */
  getLastStage(txId: TransactionId): ProvenanceRecord | undefined {
    const chain = this.chains.get(txId);
    if (!chain || chain.length === 0) return undefined;
    return chain[chain.length - 1];
  }

  /**
   * Get all transaction IDs with provenance records.
   */
  get transactionIds(): TransactionId[] {
    return [...this.chains.keys()];
  }

  /**
   * Get the total number of provenance records across all transactions.
   */
  get totalRecords(): number {
    let total = 0;
    for (const chain of this.chains.values()) {
      total += chain.length;
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private addRecord(txId: TransactionId, record: ProvenanceRecord): ProvenanceRecord {
    let chain = this.chains.get(txId);
    if (!chain) {
      chain = [];
      this.chains.set(txId, chain);
    }
    chain.push(record);

    this.logger?.info(`[Provenance] ${record.stage}:${record.outcome} for ${txId}`, {
      action: record.action,
    });

    return record;
  }
}
