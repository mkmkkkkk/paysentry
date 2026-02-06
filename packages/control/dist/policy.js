// =============================================================================
// PolicyEngine — Deterministic policy evaluation for agent payments
// Adapted from AgentGate's PolicyEngine with expanded capabilities:
// - Declarative JSON policy definitions
// - Time-based rules (daily/weekly/monthly limits)
// - Per-agent, per-service, per-protocol granularity
// - Approval chain support
// =============================================================================
import { matchesGlob } from '@paysentry/core';
/**
 * PolicyEngine evaluates agent transactions against declarative spend policies.
 * It is deterministic — no LLM, no AI, no probabilistic reasoning.
 * If the policy says no, it's no.
 *
 * @example
 * ```ts
 * const engine = new PolicyEngine({ logger: console });
 *
 * engine.loadPolicy({
 *   id: 'default' as PolicyId,
 *   name: 'Default Policy',
 *   enabled: true,
 *   rules: [
 *     blockAbove(1000, 'USDC'),
 *     requireApprovalAbove(100, 'USDC'),
 *     allowAll(),
 *   ],
 *   budgets: [
 *     { window: 'daily', maxAmount: 500, currency: 'USDC' },
 *     { window: 'monthly', maxAmount: 5000, currency: 'USDC' },
 *   ],
 * });
 *
 * const result = engine.evaluate(transaction);
 * if (!result.allowed) {
 *   console.log(`Blocked: ${result.reason}`);
 * }
 * ```
 */
export class PolicyEngine {
    /** Loaded policies, keyed by policy ID */
    policies = new Map();
    /** Spend tracking: 'budget_key:window_key' -> SpendBucket */
    spendBuckets = new Map();
    /** Last transaction timestamp per agent (for cooldown) */
    lastTransactionTime = new Map();
    logger;
    constructor(options) {
        this.logger = options?.logger;
    }
    /**
     * Load a spend policy into the engine.
     * Multiple policies can be loaded; all are evaluated.
     */
    loadPolicy(policy) {
        this.policies.set(policy.id, policy);
        this.logger?.info(`[PolicyEngine] Loaded policy: ${policy.name} (${policy.id})`);
    }
    /**
     * Remove a policy by ID.
     */
    removePolicy(policyId) {
        const removed = this.policies.delete(policyId);
        if (removed) {
            this.logger?.info(`[PolicyEngine] Removed policy: ${policyId}`);
        }
        return removed;
    }
    /**
     * Get all loaded policies.
     */
    getPolicies() {
        return [...this.policies.values()];
    }
    /**
     * Evaluate a transaction against ALL loaded policies.
     * Returns the most restrictive result.
     *
     * Evaluation order:
     * 1. Budget limits (hard caps)
     * 2. Cooldown check
     * 3. Policy rules (by priority, first match wins per policy)
     *
     * Across policies, the most restrictive action wins:
     * deny > require_approval > flag > allow
     */
    evaluate(tx) {
        const results = [];
        for (const policy of this.policies.values()) {
            if (!policy.enabled)
                continue;
            // Check budgets first (hard limits)
            const budgetResult = this.evaluateBudgets(tx, policy);
            if (budgetResult) {
                results.push(budgetResult);
                continue; // Budget violation is definitive for this policy
            }
            // Check cooldown
            const cooldownResult = this.evaluateCooldown(tx, policy);
            if (cooldownResult) {
                results.push(cooldownResult);
                continue;
            }
            // Check rules
            const ruleResult = this.evaluateRules(tx, policy);
            results.push(ruleResult);
        }
        if (results.length === 0) {
            return {
                allowed: true,
                action: 'allow',
                reason: 'No policies loaded — allowing by default',
                details: {},
            };
        }
        // Return the most restrictive result
        return this.getMostRestrictive(results);
    }
    /**
     * Record a completed transaction for budget tracking.
     * Call this after a transaction is executed to update spend counters.
     */
    recordTransaction(tx) {
        for (const policy of this.policies.values()) {
            if (!policy.enabled)
                continue;
            for (const budget of policy.budgets) {
                if (budget.currency && budget.currency !== tx.currency)
                    continue;
                if (budget.agentIds?.length && !budget.agentIds.includes(tx.agentId))
                    continue;
                if (budget.serviceIds?.length && (!tx.service || !budget.serviceIds.includes(tx.service)))
                    continue;
                const bucketKey = this.getBudgetBucketKey(policy.id, budget, tx);
                const bucket = this.spendBuckets.get(bucketKey) ?? {
                    key: bucketKey,
                    amount: 0,
                    count: 0,
                };
                bucket.amount += tx.amount;
                bucket.count++;
                this.spendBuckets.set(bucketKey, bucket);
            }
            // Update cooldown tracking
            this.lastTransactionTime.set(tx.agentId, Date.now());
        }
        this.logger?.info(`[PolicyEngine] Recorded transaction ${tx.id}`, {
            amount: tx.amount,
            currency: tx.currency,
        });
    }
    /**
     * Reset all spend counters. Useful for testing.
     */
    reset() {
        this.spendBuckets.clear();
        this.lastTransactionTime.clear();
        this.logger?.info('[PolicyEngine] Reset all counters');
    }
    /**
     * Get current spend for a specific budget window.
     */
    getCurrentSpend(policyId, budget, referenceTime) {
        const windowKey = this.getWindowKey(budget.window, referenceTime ?? new Date());
        const scope = this.getBudgetScope(budget);
        const bucketKey = `${policyId}:${scope}:${budget.window}:${windowKey}`;
        const bucket = this.spendBuckets.get(bucketKey);
        return bucket ? { amount: bucket.amount, count: bucket.count } : { amount: 0, count: 0 };
    }
    // ---------------------------------------------------------------------------
    // Budget evaluation
    // ---------------------------------------------------------------------------
    evaluateBudgets(tx, policy) {
        for (const budget of policy.budgets) {
            // Check currency match
            if (budget.currency && budget.currency !== tx.currency)
                continue;
            // Check agent scope
            if (budget.agentIds?.length && !budget.agentIds.includes(tx.agentId))
                continue;
            // Check service scope
            if (budget.serviceIds?.length && (!tx.service || !budget.serviceIds.includes(tx.service)))
                continue;
            const bucketKey = this.getBudgetBucketKey(policy.id, budget, tx);
            const currentBucket = this.spendBuckets.get(bucketKey);
            const currentAmount = currentBucket?.amount ?? 0;
            const projectedAmount = currentAmount + tx.amount;
            if (projectedAmount > budget.maxAmount) {
                return {
                    allowed: false,
                    action: 'deny',
                    reason: `${budget.window} budget exceeded: $${projectedAmount.toFixed(2)} would exceed limit of $${budget.maxAmount} ${budget.currency ?? ''}`.trim(),
                    details: {
                        policyId: policy.id,
                        policyName: policy.name,
                        budgetWindow: budget.window,
                        currentSpend: currentAmount,
                        transactionAmount: tx.amount,
                        projectedSpend: projectedAmount,
                        limit: budget.maxAmount,
                        currency: budget.currency,
                    },
                };
            }
        }
        return null;
    }
    // ---------------------------------------------------------------------------
    // Cooldown evaluation
    // ---------------------------------------------------------------------------
    evaluateCooldown(tx, policy) {
        if (!policy.cooldownMs)
            return null;
        const lastTime = this.lastTransactionTime.get(tx.agentId);
        if (lastTime === undefined)
            return null;
        const elapsed = Date.now() - lastTime;
        if (elapsed < policy.cooldownMs) {
            const remainingMs = policy.cooldownMs - elapsed;
            return {
                allowed: false,
                action: 'deny',
                reason: `Cooldown active: ${remainingMs}ms remaining (minimum ${policy.cooldownMs}ms between transactions)`,
                details: {
                    policyId: policy.id,
                    policyName: policy.name,
                    elapsed,
                    required: policy.cooldownMs,
                    remainingMs,
                },
            };
        }
        return null;
    }
    // ---------------------------------------------------------------------------
    // Rule evaluation
    // ---------------------------------------------------------------------------
    evaluateRules(tx, policy) {
        // Sort rules by priority (ascending)
        const sortedRules = [...policy.rules]
            .filter((r) => r.enabled)
            .sort((a, b) => a.priority - b.priority);
        for (const rule of sortedRules) {
            if (this.matchesConditions(tx, rule)) {
                const allowed = rule.action === 'allow' || rule.action === 'flag';
                return {
                    allowed,
                    action: rule.action,
                    triggeredRule: rule,
                    reason: `Rule "${rule.name}" matched: action=${rule.action}`,
                    details: {
                        policyId: policy.id,
                        policyName: policy.name,
                        ruleId: rule.id,
                        ruleName: rule.name,
                        ruleAction: rule.action,
                    },
                };
            }
        }
        // No rules matched — default allow
        return {
            allowed: true,
            action: 'allow',
            reason: `No rules matched in policy "${policy.name}" — allowing by default`,
            details: {
                policyId: policy.id,
                policyName: policy.name,
            },
        };
    }
    /**
     * Check if a transaction matches a rule's conditions.
     * All specified conditions must match (AND logic).
     */
    matchesConditions(tx, rule) {
        const cond = rule.conditions;
        // Agent match
        if (cond.agents?.length) {
            const matches = cond.agents.some((pattern) => matchesGlob(tx.agentId, pattern));
            if (!matches)
                return false;
        }
        // Recipient match
        if (cond.recipients?.length) {
            const matches = cond.recipients.some((pattern) => matchesGlob(tx.recipient, pattern));
            if (!matches)
                return false;
        }
        // Service match
        if (cond.services?.length) {
            if (!tx.service)
                return false;
            const matches = cond.services.some((s) => s === tx.service);
            if (!matches)
                return false;
        }
        // Protocol match
        if (cond.protocols?.length) {
            const matches = cond.protocols.some((p) => p === tx.protocol);
            if (!matches)
                return false;
        }
        // Amount range
        if (cond.minAmount !== undefined && tx.amount < cond.minAmount)
            return false;
        if (cond.maxAmount !== undefined && tx.amount > cond.maxAmount)
            return false;
        // Currency match
        if (cond.currencies?.length) {
            const matches = cond.currencies.some((c) => c === tx.currency);
            if (!matches)
                return false;
        }
        // Metadata match (all specified keys must match)
        if (cond.metadata) {
            for (const [key, value] of Object.entries(cond.metadata)) {
                if (tx.metadata[key] !== value)
                    return false;
            }
        }
        return true;
    }
    // ---------------------------------------------------------------------------
    // Restrictiveness ordering
    // ---------------------------------------------------------------------------
    actionSeverity = {
        deny: 0,
        require_approval: 1,
        flag: 2,
        allow: 3,
    };
    getMostRestrictive(results) {
        return results.sort((a, b) => this.actionSeverity[a.action] - this.actionSeverity[b.action])[0];
    }
    // ---------------------------------------------------------------------------
    // Budget bucket key generation
    // ---------------------------------------------------------------------------
    getBudgetBucketKey(policyId, budget, tx) {
        const windowKey = this.getWindowKey(budget.window, new Date(tx.createdAt));
        const scope = this.getBudgetScope(budget);
        return `${policyId}:${scope}:${budget.window}:${windowKey}`;
    }
    getBudgetScope(budget) {
        const parts = [];
        if (budget.agentIds?.length)
            parts.push(`agents:${budget.agentIds.join(',')}`);
        if (budget.serviceIds?.length)
            parts.push(`services:${budget.serviceIds.join(',')}`);
        if (budget.currency)
            parts.push(`currency:${budget.currency}`);
        return parts.length > 0 ? parts.join('|') : 'global';
    }
    getWindowKey(window, date) {
        switch (window) {
            case 'per_transaction':
                return date.toISOString();
            case 'hourly':
                return date.toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
            case 'daily':
                return date.toISOString().slice(0, 10); // 'YYYY-MM-DD'
            case 'weekly': {
                // ISO week: Monday as start of week
                const d = new Date(date);
                const day = d.getDay();
                const mondayOffset = day === 0 ? -6 : 1 - day;
                d.setDate(d.getDate() + mondayOffset);
                return d.toISOString().slice(0, 10);
            }
            case 'monthly':
                return date.toISOString().slice(0, 7); // 'YYYY-MM'
        }
    }
}
//# sourceMappingURL=policy.js.map