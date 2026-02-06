import type { AgentTransaction, AgentId, TransactionId, TransactionStatus, ServiceId, PaymentProtocol, Logger } from '@paysentry/core';
/** Filter criteria for querying transactions */
export interface TransactionFilter {
    /** Filter by agent ID */
    readonly agentId?: AgentId;
    /** Filter by recipient (exact match) */
    readonly recipient?: string;
    /** Filter by service */
    readonly service?: ServiceId;
    /** Filter by protocol */
    readonly protocol?: PaymentProtocol;
    /** Filter by status */
    readonly status?: TransactionStatus;
    /** Filter by currency */
    readonly currency?: string;
    /** Minimum amount (inclusive) */
    readonly minAmount?: number;
    /** Maximum amount (inclusive) */
    readonly maxAmount?: number;
    /** ISO 8601 — transactions created after this time */
    readonly after?: string;
    /** ISO 8601 — transactions created before this time */
    readonly before?: string;
    /** Maximum number of results */
    readonly limit?: number;
}
/**
 * SpendTracker records, stores, and queries agent transactions.
 * It maintains in-memory indices for fast lookups by agent, service,
 * and time range.
 *
 * @example
 * ```ts
 * const tracker = new SpendTracker();
 * tracker.record(transaction);
 *
 * const agentTxs = tracker.getByAgent('agent-1' as AgentId);
 * const recentTxs = tracker.query({ after: '2026-01-01T00:00:00Z', limit: 50 });
 * ```
 */
export declare class SpendTracker {
    /** Primary storage: id -> transaction */
    private readonly transactions;
    /** Index: agentId -> set of transaction IDs */
    private readonly byAgent;
    /** Index: service -> set of transaction IDs */
    private readonly byService;
    /** Index: recipient -> set of transaction IDs */
    private readonly byRecipient;
    /** Chronologically ordered transaction IDs */
    private readonly chronological;
    private readonly logger?;
    constructor(options?: {
        logger?: Logger;
    });
    /**
     * Record a transaction. If a transaction with the same ID already exists,
     * it will be updated (useful for status changes).
     */
    record(tx: AgentTransaction): void;
    /**
     * Get a single transaction by ID.
     */
    get(id: TransactionId): AgentTransaction | undefined;
    /**
     * Get all transactions for a specific agent, newest first.
     */
    getByAgent(agentId: AgentId): AgentTransaction[];
    /**
     * Get all transactions for a specific service, newest first.
     */
    getByService(serviceId: ServiceId): AgentTransaction[];
    /**
     * Get all transactions for a specific recipient, newest first.
     */
    getByRecipient(recipient: string): AgentTransaction[];
    /**
     * Query transactions with flexible filtering.
     * Results are returned newest first.
     */
    query(filter: TransactionFilter): AgentTransaction[];
    /**
     * Get the total number of recorded transactions.
     */
    get size(): number;
    /**
     * Get all unique agent IDs that have transactions.
     */
    get agents(): AgentId[];
    /**
     * Get all unique recipients that have received payments.
     */
    get recipients(): string[];
    private addToIndex;
    private resolveIds;
}
//# sourceMappingURL=tracker.d.ts.map