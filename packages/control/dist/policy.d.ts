import type { AgentTransaction, SpendPolicy, PolicyEvaluation, BudgetLimit, Logger } from '@paysentry/core';
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
export declare class PolicyEngine {
    /** Loaded policies, keyed by policy ID */
    private readonly policies;
    /** Spend tracking: 'budget_key:window_key' -> SpendBucket */
    private readonly spendBuckets;
    /** Last transaction timestamp per agent (for cooldown) */
    private readonly lastTransactionTime;
    private readonly logger?;
    constructor(options?: {
        logger?: Logger;
    });
    /**
     * Load a spend policy into the engine.
     * Multiple policies can be loaded; all are evaluated.
     */
    loadPolicy(policy: SpendPolicy): void;
    /**
     * Remove a policy by ID.
     */
    removePolicy(policyId: string): boolean;
    /**
     * Get all loaded policies.
     */
    getPolicies(): SpendPolicy[];
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
    evaluate(tx: AgentTransaction): PolicyEvaluation;
    /**
     * Record a completed transaction for budget tracking.
     * Call this after a transaction is executed to update spend counters.
     */
    recordTransaction(tx: AgentTransaction): void;
    /**
     * Reset all spend counters. Useful for testing.
     */
    reset(): void;
    /**
     * Get current spend for a specific budget window.
     */
    getCurrentSpend(policyId: string, budget: BudgetLimit, referenceTime?: Date): {
        amount: number;
        count: number;
    };
    private evaluateBudgets;
    private evaluateCooldown;
    private evaluateRules;
    /**
     * Check if a transaction matches a rule's conditions.
     * All specified conditions must match (AND logic).
     */
    private matchesConditions;
    private readonly actionSeverity;
    private getMostRestrictive;
    private getBudgetBucketKey;
    private getBudgetScope;
    private getWindowKey;
}
//# sourceMappingURL=policy.d.ts.map