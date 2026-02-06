// =============================================================================
// SpendAnalytics — Per-agent, per-service, per-time breakdowns
// Turns raw transaction data into actionable spending intelligence
// =============================================================================
/**
 * SpendAnalytics provides computed insights from raw transaction data.
 * It reads from a SpendTracker and produces aggregated analytics.
 *
 * @example
 * ```ts
 * const analytics = new SpendAnalytics(tracker);
 * const agentReport = analytics.getAgentAnalytics('agent-1' as AgentId, 'daily');
 * console.log(agentReport.spendByCurrency);
 * ```
 */
export class SpendAnalytics {
    tracker;
    constructor(tracker) {
        this.tracker = tracker;
    }
    /**
     * Compute a spend summary from a set of transactions.
     */
    summarize(transactions, currency) {
        const filtered = transactions.filter((tx) => tx.currency === currency && tx.status === 'completed');
        if (filtered.length === 0) {
            return {
                totalAmount: 0,
                transactionCount: 0,
                averageAmount: 0,
                maxAmount: 0,
                minAmount: 0,
                currency,
            };
        }
        const amounts = filtered.map((tx) => tx.amount);
        const total = amounts.reduce((sum, a) => sum + a, 0);
        return {
            totalAmount: Math.round(total * 1e6) / 1e6,
            transactionCount: filtered.length,
            averageAmount: Math.round((total / filtered.length) * 1e6) / 1e6,
            maxAmount: Math.max(...amounts),
            minAmount: Math.min(...amounts),
            currency,
        };
    }
    /**
     * Get comprehensive analytics for a specific agent.
     *
     * @param agentId - Agent to analyze
     * @param timeWindow - Granularity for time series data
     * @param since - Only consider transactions after this ISO 8601 timestamp
     */
    getAgentAnalytics(agentId, timeWindow = 'daily', since) {
        let transactions = this.tracker.getByAgent(agentId);
        if (since) {
            transactions = transactions.filter((tx) => tx.createdAt >= since);
        }
        // Spend by currency
        const currencies = new Set(transactions.map((tx) => tx.currency));
        const spendByCurrency = new Map();
        for (const currency of currencies) {
            spendByCurrency.set(currency, this.summarize(transactions, currency));
        }
        // Spend by service
        const spendByService = new Map();
        const serviceGroups = this.groupBy(transactions, (tx) => tx.service ?? 'unknown');
        for (const [service, txs] of serviceGroups) {
            const currencies2 = new Set(txs.map((tx) => tx.currency));
            for (const currency of currencies2) {
                const key = `${service}:${currency}`;
                spendByService.set(key, this.summarize(txs, currency));
            }
        }
        // Spend by protocol
        const spendByProtocol = new Map();
        const protocolGroups = this.groupBy(transactions, (tx) => tx.protocol);
        for (const [protocol, txs] of protocolGroups) {
            const currencies2 = new Set(txs.map((tx) => tx.currency));
            for (const currency of currencies2) {
                spendByProtocol.set(`${protocol}:${currency}`, this.summarize(txs, currency));
            }
        }
        // Top recipients
        const recipientMap = new Map();
        for (const tx of transactions.filter((t) => t.status === 'completed')) {
            const entry = recipientMap.get(tx.recipient) ?? { totalAmount: 0, count: 0 };
            entry.totalAmount += tx.amount;
            entry.count++;
            recipientMap.set(tx.recipient, entry);
        }
        const topRecipients = [...recipientMap.entries()]
            .map(([recipient, data]) => ({ recipient, ...data }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, 10);
        // Time series
        const timeSeries = this.buildTimeSeries(transactions, timeWindow);
        return {
            agentId,
            spendByCurrency,
            spendByService,
            spendByProtocol,
            topRecipients,
            timeSeries,
        };
    }
    /**
     * Get the total spend across all agents within a time range.
     */
    getTotalSpend(currency, since, until) {
        const all = this.tracker.query({
            currency,
            status: 'completed',
            after: since,
            before: until,
        });
        return this.summarize(all, currency);
    }
    /**
     * Get a leaderboard of agents by total spend.
     */
    getAgentLeaderboard(currency, limit = 10) {
        const agentMap = new Map();
        for (const agentId of this.tracker.agents) {
            const txs = this.tracker.getByAgent(agentId).filter((tx) => tx.currency === currency && tx.status === 'completed');
            if (txs.length > 0) {
                const total = txs.reduce((sum, tx) => sum + tx.amount, 0);
                agentMap.set(agentId, { totalAmount: total, count: txs.length });
            }
        }
        return [...agentMap.entries()]
            .map(([agentId, data]) => ({ agentId: agentId, ...data }))
            .sort((a, b) => b.totalAmount - a.totalAmount)
            .slice(0, limit);
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    groupBy(items, keyFn) {
        const groups = new Map();
        for (const item of items) {
            const key = keyFn(item);
            let group = groups.get(key);
            if (!group) {
                group = [];
                groups.set(key, group);
            }
            group.push(item);
        }
        return groups;
    }
    buildTimeSeries(transactions, window) {
        if (transactions.length === 0)
            return [];
        const completed = transactions.filter((tx) => tx.status === 'completed');
        if (completed.length === 0)
            return [];
        const buckets = new Map();
        for (const tx of completed) {
            const key = this.getPeriodKey(tx.createdAt, window);
            const bucket = buckets.get(key) ?? { total: 0, count: 0 };
            bucket.total += tx.amount;
            bucket.count++;
            buckets.set(key, bucket);
        }
        return [...buckets.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, data]) => ({
            periodStart: key,
            periodEnd: this.getNextPeriod(key, window),
            totalAmount: Math.round(data.total * 1e6) / 1e6,
            transactionCount: data.count,
        }));
    }
    getPeriodKey(isoDate, window) {
        const date = new Date(isoDate);
        switch (window) {
            case 'per_transaction':
                return isoDate;
            case 'hourly':
                return date.toISOString().slice(0, 13) + ':00:00.000Z';
            case 'daily':
                return date.toISOString().slice(0, 10) + 'T00:00:00.000Z';
            case 'weekly': {
                const day = date.getDay();
                const mondayOffset = day === 0 ? -6 : 1 - day;
                const monday = new Date(date);
                monday.setDate(date.getDate() + mondayOffset);
                return monday.toISOString().slice(0, 10) + 'T00:00:00.000Z';
            }
            case 'monthly':
                return date.toISOString().slice(0, 7) + '-01T00:00:00.000Z';
        }
    }
    getNextPeriod(periodStart, window) {
        const date = new Date(periodStart);
        switch (window) {
            case 'per_transaction':
                return periodStart;
            case 'hourly':
                date.setHours(date.getHours() + 1);
                break;
            case 'daily':
                date.setDate(date.getDate() + 1);
                break;
            case 'weekly':
                date.setDate(date.getDate() + 7);
                break;
            case 'monthly':
                date.setMonth(date.getMonth() + 1);
                break;
        }
        return date.toISOString();
    }
}
//# sourceMappingURL=analytics.js.map