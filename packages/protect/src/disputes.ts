// =============================================================================
// DisputeManager — Open, track, and resolve payment disputes
// Central registry for all dispute cases with lifecycle management
// =============================================================================

import type {
  DisputeCase,
  DisputeEvidence,
  DisputeId,
  DisputeStatus,
  TransactionId,
  AgentId,
  LiabilityAttribution,
  Logger,
} from '@paysentry/core';
import { generateDisputeId } from '@paysentry/core';
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
export class DisputeManager {
  /** All disputes, keyed by dispute ID */
  private readonly disputes: Map<DisputeId, DisputeCase> = new Map();

  /** Index: transactionId -> disputeId */
  private readonly byTransaction: Map<TransactionId, DisputeId> = new Map();

  /** Index: agentId -> set of dispute IDs */
  private readonly byAgent: Map<string, Set<DisputeId>> = new Map();

  /** Status change listeners */
  private readonly listeners: DisputeListener[] = [];

  private readonly provenance?: TransactionProvenance;
  private readonly logger?: Logger;

  constructor(options?: {
    provenance?: TransactionProvenance;
    logger?: Logger;
  }) {
    this.provenance = options?.provenance;
    this.logger = options?.logger;
  }

  /**
   * File a new dispute case.
   * Automatically pulls provenance records as initial evidence if available.
   */
  file(input: FileDisputeInput): DisputeCase {
    // Check if dispute already exists for this transaction
    const existing = this.byTransaction.get(input.transactionId);
    if (existing) {
      const existingCase = this.disputes.get(existing);
      if (existingCase && !this.isClosed(existingCase.status)) {
        throw new Error(
          `Active dispute ${existing} already exists for transaction ${input.transactionId}`
        );
      }
    }

    const now = new Date().toISOString();
    const evidence: DisputeEvidence[] = [];

    // Pull provenance records as evidence
    if (this.provenance) {
      const chain = this.provenance.getChain(input.transactionId);
      if (chain.length > 0) {
        evidence.push({
          type: 'transaction_log',
          description: `Transaction provenance chain (${chain.length} records)`,
          data: chain,
          addedAt: now,
        });
      }
    }

    // Add user-provided evidence
    if (input.evidence) {
      evidence.push(...input.evidence);
    }

    const dispute: DisputeCase = {
      id: generateDisputeId(),
      transactionId: input.transactionId,
      agentId: input.agentId,
      reason: input.reason,
      status: 'open',
      liability: 'undetermined',
      requestedAmount: input.requestedAmount,
      createdAt: now,
      updatedAt: now,
      evidence,
    };

    this.disputes.set(dispute.id, dispute);
    this.byTransaction.set(input.transactionId, dispute.id);

    let agentSet = this.byAgent.get(input.agentId);
    if (!agentSet) {
      agentSet = new Set();
      this.byAgent.set(input.agentId, agentSet);
    }
    agentSet.add(dispute.id);

    // Record in provenance
    if (this.provenance) {
      this.provenance.recordDispute(input.transactionId, {
        disputeId: dispute.id,
        reason: input.reason,
        requestedAmount: input.requestedAmount,
      });
    }

    this.logger?.info(`[DisputeManager] Filed dispute ${dispute.id} for tx ${input.transactionId}`);

    return dispute;
  }

  /**
   * Add evidence to an existing dispute.
   */
  addEvidence(disputeId: DisputeId, evidence: DisputeEvidence): void {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    if (this.isClosed(dispute.status)) {
      throw new Error(`Cannot add evidence to closed dispute ${disputeId}`);
    }

    (dispute.evidence as DisputeEvidence[]).push(evidence);
    dispute.updatedAt = new Date().toISOString();

    this.logger?.info(`[DisputeManager] Added evidence to dispute ${disputeId}`, {
      type: evidence.type,
    });
  }

  /**
   * Update the status of a dispute (e.g., open -> investigating).
   */
  updateStatus(disputeId: DisputeId, newStatus: DisputeStatus): void {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const previousStatus = dispute.status;
    dispute.status = newStatus;
    dispute.updatedAt = new Date().toISOString();

    this.logger?.info(
      `[DisputeManager] Dispute ${disputeId} status: ${previousStatus} -> ${newStatus}`
    );

    // Notify listeners
    this.notifyListeners(dispute, previousStatus);
  }

  /**
   * Resolve a dispute with a final determination.
   */
  resolve(
    disputeId: DisputeId,
    resolution: {
      status: 'resolved_refunded' | 'resolved_denied' | 'resolved_partial';
      liability: LiabilityAttribution;
      resolvedAmount?: number;
    }
  ): DisputeCase {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute ${disputeId} not found`);
    }

    const previousStatus = dispute.status;
    dispute.status = resolution.status;
    dispute.liability = resolution.liability;
    dispute.resolvedAmount = resolution.resolvedAmount;
    dispute.resolvedAt = new Date().toISOString();
    dispute.updatedAt = dispute.resolvedAt;

    this.logger?.info(
      `[DisputeManager] Resolved dispute ${disputeId}: ${resolution.status}, liability=${resolution.liability}`
    );

    this.notifyListeners(dispute, previousStatus);

    return dispute;
  }

  /**
   * Get a dispute by ID.
   */
  get(disputeId: DisputeId): DisputeCase | undefined {
    return this.disputes.get(disputeId);
  }

  /**
   * Get the dispute associated with a transaction.
   */
  getByTransaction(txId: TransactionId): DisputeCase | undefined {
    const disputeId = this.byTransaction.get(txId);
    return disputeId ? this.disputes.get(disputeId) : undefined;
  }

  /**
   * Get all disputes for an agent.
   */
  getByAgent(agentId: AgentId): DisputeCase[] {
    const ids = this.byAgent.get(agentId);
    if (!ids) return [];
    return [...ids]
      .map((id) => this.disputes.get(id))
      .filter((d): d is DisputeCase => d !== undefined);
  }

  /**
   * Query disputes with filtering.
   */
  query(filter: DisputeFilter): DisputeCase[] {
    let results = [...this.disputes.values()];

    if (filter.status) {
      results = results.filter((d) => d.status === filter.status);
    }
    if (filter.agentId) {
      results = results.filter((d) => d.agentId === filter.agentId);
    }
    if (filter.transactionId) {
      results = results.filter((d) => d.transactionId === filter.transactionId);
    }
    if (filter.liability) {
      results = results.filter((d) => d.liability === filter.liability);
    }

    // Sort newest first
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Register a listener for dispute status changes.
   */
  onStatusChange(listener: DisputeListener): void {
    this.listeners.push(listener);
  }

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
  } {
    let open = 0;
    let investigating = 0;
    let resolved = 0;
    let escalated = 0;
    let totalRequestedAmount = 0;
    let totalResolvedAmount = 0;

    for (const dispute of this.disputes.values()) {
      totalRequestedAmount += dispute.requestedAmount;
      totalResolvedAmount += dispute.resolvedAmount ?? 0;

      switch (dispute.status) {
        case 'open':
          open++;
          break;
        case 'investigating':
          investigating++;
          break;
        case 'resolved_refunded':
        case 'resolved_denied':
        case 'resolved_partial':
          resolved++;
          break;
        case 'escalated':
          escalated++;
          break;
      }
    }

    return {
      total: this.disputes.size,
      open,
      investigating,
      resolved,
      escalated,
      totalRequestedAmount,
      totalResolvedAmount,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private isClosed(status: DisputeStatus): boolean {
    return (
      status === 'resolved_refunded' ||
      status === 'resolved_denied' ||
      status === 'resolved_partial'
    );
  }

  private notifyListeners(dispute: DisputeCase, previousStatus: DisputeStatus): void {
    for (const listener of this.listeners) {
      try {
        void listener(dispute, previousStatus);
      } catch (err) {
        this.logger?.error(`[DisputeManager] Listener error: ${err}`);
      }
    }
  }
}
