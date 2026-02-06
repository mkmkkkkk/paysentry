// =============================================================================
// SpendAlerts — Threshold alerts and anomaly detection
// Watches the transaction stream and fires alerts when conditions are met
// =============================================================================
/**
 * SpendAlerts monitors the transaction stream and fires alerts when
 * configured conditions are met. It supports budget thresholds, large
 * transaction detection, rate spike detection, new recipient alerts,
 * and statistical anomaly detection.
 *
 * @example
 * ```ts
 * const alerts = new SpendAlerts(tracker);
 *
 * alerts.addRule({
 *   id: 'daily-budget',
 *   name: 'Daily USDC Budget',
 *   type: 'budget_threshold',
 *   severity: 'warning',
 *   enabled: true,
 *   config: {
 *     type: 'budget_threshold',
 *     threshold: 100,
 *     currency: 'USDC',
 *     windowMs: 86400000, // 24 hours
 *     alertAtPercent: 0.8,
 *   },
 * });
 *
 * alerts.onAlert((alert) => {
 *   console.log(`[${alert.severity}] ${alert.message}`);
 * });
 *
 * // Check a new transaction against all rules
 * await alerts.evaluate(transaction);
 * ```
 */
export class SpendAlerts {
    tracker;
    rules = new Map();
    handlers = [];
    knownRecipients = new Map();
    logger;
    constructor(tracker, options) {
        this.tracker = tracker;
        this.logger = options?.logger;
    }
    /**
     * Add an alert rule.
     */
    addRule(rule) {
        this.rules.set(rule.id, rule);
        this.logger?.info(`[SpendAlerts] Added rule: ${rule.name} (${rule.id})`);
    }
    /**
     * Remove an alert rule by ID.
     */
    removeRule(id) {
        const removed = this.rules.delete(id);
        if (removed) {
            this.logger?.info(`[SpendAlerts] Removed rule: ${id}`);
        }
        return removed;
    }
    /**
     * Register an alert handler. Called whenever an alert fires.
     */
    onAlert(handler) {
        this.handlers.push(handler);
    }
    /**
     * Evaluate a transaction against all active alert rules.
     * Fires alerts to all registered handlers if conditions are met.
     */
    async evaluate(tx) {
        const alerts = [];
        for (const rule of this.rules.values()) {
            if (!rule.enabled)
                continue;
            const alert = this.checkRule(rule, tx);
            if (alert) {
                alerts.push(alert);
            }
        }
        // Fire all alerts to handlers
        for (const alert of alerts) {
            this.logger?.warn(`[SpendAlerts] Alert fired: ${alert.message}`);
            for (const handler of this.handlers) {
                try {
                    await handler(alert);
                }
                catch (err) {
                    this.logger?.error(`[SpendAlerts] Handler error: ${err}`);
                }
            }
        }
        return alerts;
    }
    /**
     * Get all configured rules.
     */
    getRules() {
        return [...this.rules.values()];
    }
    // ---------------------------------------------------------------------------
    // Private rule evaluation
    // ---------------------------------------------------------------------------
    checkRule(rule, tx) {
        switch (rule.config.type) {
            case 'budget_threshold':
                return this.checkBudgetThreshold(rule, tx, rule.config);
            case 'large_transaction':
                return this.checkLargeTransaction(rule, tx, rule.config);
            case 'rate_spike':
                return this.checkRateSpike(rule, tx, rule.config);
            case 'new_recipient':
                return this.checkNewRecipient(rule, tx, rule.config);
            case 'anomaly':
                return this.checkAnomaly(rule, tx, rule.config);
        }
    }
    checkBudgetThreshold(rule, tx, config) {
        if (config.agentId && tx.agentId !== config.agentId)
            return null;
        if (tx.currency !== config.currency)
            return null;
        const windowStart = new Date(Date.now() - config.windowMs).toISOString();
        const recentTxs = this.tracker.query({
            agentId: config.agentId,
            currency: config.currency,
            status: 'completed',
            after: windowStart,
        });
        const currentSpend = recentTxs.reduce((sum, t) => sum + t.amount, 0);
        const projectedSpend = currentSpend + tx.amount;
        const thresholdAmount = config.threshold * config.alertAtPercent;
        if (projectedSpend >= thresholdAmount) {
            const percent = Math.round((projectedSpend / config.threshold) * 100);
            return this.createAlert(rule, tx, {
                message: `Budget ${percent}% utilized: $${projectedSpend.toFixed(2)} of $${config.threshold} ${config.currency} limit`,
                data: {
                    currentSpend,
                    projectedSpend,
                    threshold: config.threshold,
                    percentUsed: percent,
                },
            });
        }
        return null;
    }
    checkLargeTransaction(rule, tx, config) {
        if (tx.currency !== config.currency)
            return null;
        if (tx.amount < config.threshold)
            return null;
        return this.createAlert(rule, tx, {
            message: `Large transaction detected: $${tx.amount} ${tx.currency} to ${tx.recipient}`,
            data: {
                amount: tx.amount,
                threshold: config.threshold,
                recipient: tx.recipient,
            },
        });
    }
    checkRateSpike(rule, tx, config) {
        if (config.agentId && tx.agentId !== config.agentId)
            return null;
        const windowStart = new Date(Date.now() - config.windowMs).toISOString();
        const recentTxs = this.tracker.query({
            agentId: config.agentId,
            after: windowStart,
        });
        // +1 for the current transaction being evaluated
        const txCount = recentTxs.length + 1;
        if (txCount > config.maxTransactions) {
            return this.createAlert(rule, tx, {
                message: `Transaction rate spike: ${txCount} transactions in ${config.windowMs / 1000}s window (limit: ${config.maxTransactions})`,
                data: {
                    transactionCount: txCount,
                    maxTransactions: config.maxTransactions,
                    windowMs: config.windowMs,
                },
            });
        }
        return null;
    }
    checkNewRecipient(rule, tx, config) {
        if (config.agentId && tx.agentId !== config.agentId)
            return null;
        const agentKey = config.agentId ?? '__all__';
        let known = this.knownRecipients.get(agentKey);
        if (!known) {
            // Initialize from existing transactions
            known = new Set();
            const existingTxs = config.agentId
                ? this.tracker.getByAgent(config.agentId)
                : this.tracker.query({});
            for (const existingTx of existingTxs) {
                known.add(existingTx.recipient);
            }
            this.knownRecipients.set(agentKey, known);
        }
        if (!known.has(tx.recipient)) {
            known.add(tx.recipient);
            return this.createAlert(rule, tx, {
                message: `New recipient detected: ${tx.recipient} (agent: ${tx.agentId})`,
                data: {
                    recipient: tx.recipient,
                    agentId: tx.agentId,
                    knownRecipientCount: known.size,
                },
            });
        }
        return null;
    }
    checkAnomaly(rule, tx, config) {
        if (config.agentId && tx.agentId !== config.agentId)
            return null;
        const historicalTxs = config.agentId
            ? this.tracker.getByAgent(config.agentId)
            : this.tracker.query({});
        const completedAmounts = historicalTxs
            .filter((t) => t.status === 'completed' && t.currency === tx.currency)
            .map((t) => t.amount);
        if (completedAmounts.length < config.minSampleSize)
            return null;
        const mean = completedAmounts.reduce((s, a) => s + a, 0) / completedAmounts.length;
        const variance = completedAmounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / completedAmounts.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev === 0)
            return null;
        const zScore = (tx.amount - mean) / stdDev;
        if (zScore > config.stdDevThreshold) {
            return this.createAlert(rule, tx, {
                message: `Anomalous transaction amount: $${tx.amount} ${tx.currency} (${zScore.toFixed(1)} standard deviations above mean of $${mean.toFixed(2)})`,
                data: {
                    amount: tx.amount,
                    mean: Math.round(mean * 100) / 100,
                    stdDev: Math.round(stdDev * 100) / 100,
                    zScore: Math.round(zScore * 100) / 100,
                    sampleSize: completedAmounts.length,
                },
            });
        }
        return null;
    }
    // ---------------------------------------------------------------------------
    // Alert factory
    // ---------------------------------------------------------------------------
    createAlert(rule, tx, overrides) {
        return {
            type: rule.type,
            severity: rule.severity,
            message: overrides.message,
            timestamp: new Date().toISOString(),
            agentId: tx.agentId,
            transactionId: tx.id,
            data: {
                ...overrides.data,
                ruleId: rule.id,
                ruleName: rule.name,
            },
        };
    }
}
//# sourceMappingURL=alerts.js.map