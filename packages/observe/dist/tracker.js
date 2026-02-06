// =============================================================================
// SpendTracker — Records and indexes all agent transactions
// The foundation of the Observe pillar. Every transaction goes through here.
// =============================================================================
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
export class SpendTracker {
    /** Primary storage: id -> transaction */
    transactions = new Map();
    /** Index: agentId -> set of transaction IDs */
    byAgent = new Map();
    /** Index: service -> set of transaction IDs */
    byService = new Map();
    /** Index: recipient -> set of transaction IDs */
    byRecipient = new Map();
    /** Chronologically ordered transaction IDs */
    chronological = [];
    logger;
    constructor(options) {
        this.logger = options?.logger;
    }
    /**
     * Record a transaction. If a transaction with the same ID already exists,
     * it will be updated (useful for status changes).
     */
    record(tx) {
        const isUpdate = this.transactions.has(tx.id);
        this.transactions.set(tx.id, tx);
        if (!isUpdate) {
            // Index on first insert only
            this.addToIndex(this.byAgent, tx.agentId, tx.id);
            this.addToIndex(this.byRecipient, tx.recipient, tx.id);
            if (tx.service) {
                this.addToIndex(this.byService, tx.service, tx.id);
            }
            this.chronological.push(tx.id);
            this.logger?.info(`[SpendTracker] Recorded transaction ${tx.id}`, {
                agent: tx.agentId,
                amount: tx.amount,
                currency: tx.currency,
            });
        }
        else {
            this.logger?.info(`[SpendTracker] Updated transaction ${tx.id}`, {
                status: tx.status,
            });
        }
    }
    /**
     * Get a single transaction by ID.
     */
    get(id) {
        return this.transactions.get(id);
    }
    /**
     * Get all transactions for a specific agent, newest first.
     */
    getByAgent(agentId) {
        const ids = this.byAgent.get(agentId);
        if (!ids)
            return [];
        return this.resolveIds(ids).reverse();
    }
    /**
     * Get all transactions for a specific service, newest first.
     */
    getByService(serviceId) {
        const ids = this.byService.get(serviceId);
        if (!ids)
            return [];
        return this.resolveIds(ids).reverse();
    }
    /**
     * Get all transactions for a specific recipient, newest first.
     */
    getByRecipient(recipient) {
        const ids = this.byRecipient.get(recipient);
        if (!ids)
            return [];
        return this.resolveIds(ids).reverse();
    }
    /**
     * Query transactions with flexible filtering.
     * Results are returned newest first.
     */
    query(filter) {
        let results;
        // Start with the most selective index
        if (filter.agentId) {
            results = this.getByAgent(filter.agentId);
        }
        else if (filter.service) {
            results = this.getByService(filter.service);
        }
        else if (filter.recipient) {
            results = this.getByRecipient(filter.recipient);
        }
        else {
            // Full scan in reverse chronological order
            results = [...this.chronological]
                .reverse()
                .map((id) => this.transactions.get(id))
                .filter((tx) => tx !== undefined);
        }
        // Apply additional filters
        results = results.filter((tx) => {
            if (filter.agentId && tx.agentId !== filter.agentId)
                return false;
            if (filter.recipient && tx.recipient !== filter.recipient)
                return false;
            if (filter.service && tx.service !== filter.service)
                return false;
            if (filter.protocol && tx.protocol !== filter.protocol)
                return false;
            if (filter.status && tx.status !== filter.status)
                return false;
            if (filter.currency && tx.currency !== filter.currency)
                return false;
            if (filter.minAmount !== undefined && tx.amount < filter.minAmount)
                return false;
            if (filter.maxAmount !== undefined && tx.amount > filter.maxAmount)
                return false;
            if (filter.after && tx.createdAt < filter.after)
                return false;
            if (filter.before && tx.createdAt > filter.before)
                return false;
            return true;
        });
        if (filter.limit && results.length > filter.limit) {
            results = results.slice(0, filter.limit);
        }
        return results;
    }
    /**
     * Get the total number of recorded transactions.
     */
    get size() {
        return this.transactions.size;
    }
    /**
     * Get all unique agent IDs that have transactions.
     */
    get agents() {
        return [...this.byAgent.keys()];
    }
    /**
     * Get all unique recipients that have received payments.
     */
    get recipients() {
        return [...this.byRecipient.keys()];
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    addToIndex(index, key, txId) {
        let set = index.get(key);
        if (!set) {
            set = new Set();
            index.set(key, set);
        }
        set.add(txId);
    }
    resolveIds(ids) {
        const results = [];
        for (const id of ids) {
            const tx = this.transactions.get(id);
            if (tx)
                results.push(tx);
        }
        return results;
    }
}
//# sourceMappingURL=tracker.js.map