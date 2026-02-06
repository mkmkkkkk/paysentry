import type { AgentTransaction, AgentId, SpendAlert, AlertHandler, AlertSeverity, AlertType, Logger } from '@paysentry/core';
import type { SpendTracker } from './tracker.js';
/** Configuration for a single alert rule */
export interface AlertRule {
    /** Unique rule identifier */
    readonly id: string;
    /** Human-readable name */
    readonly name: string;
    /** Alert type */
    readonly type: AlertType;
    /** Alert severity */
    readonly severity: AlertSeverity;
    /** Whether the rule is active */
    readonly enabled: boolean;
    /** Rule configuration */
    readonly config: AlertRuleConfig;
}
/** Configuration specific to each alert type */
export type AlertRuleConfig = BudgetThresholdConfig | LargeTransactionConfig | RateSpikeConfig | NewRecipientConfig | AnomalyConfig;
/** Alert when cumulative spend exceeds a threshold */
export interface BudgetThresholdConfig {
    readonly type: 'budget_threshold';
    /** Agent to monitor (undefined = all agents) */
    readonly agentId?: AgentId;
    /** Threshold amount */
    readonly threshold: number;
    /** Currency */
    readonly currency: string;
    /** Time window in milliseconds */
    readonly windowMs: number;
    /** Alert at what percentage of threshold (e.g., 0.8 = 80%) */
    readonly alertAtPercent: number;
}
/** Alert on any single transaction above a threshold */
export interface LargeTransactionConfig {
    readonly type: 'large_transaction';
    /** Amount threshold */
    readonly threshold: number;
    /** Currency */
    readonly currency: string;
}
/** Alert on transaction frequency spikes */
export interface RateSpikeConfig {
    readonly type: 'rate_spike';
    /** Agent to monitor (undefined = all agents) */
    readonly agentId?: AgentId;
    /** Maximum transactions per window */
    readonly maxTransactions: number;
    /** Window size in milliseconds */
    readonly windowMs: number;
}
/** Alert when an agent transacts with a new recipient */
export interface NewRecipientConfig {
    readonly type: 'new_recipient';
    /** Agent to monitor (undefined = all agents) */
    readonly agentId?: AgentId;
}
/** Alert on statistical anomalies in spending patterns */
export interface AnomalyConfig {
    readonly type: 'anomaly';
    /** Agent to monitor (undefined = all agents) */
    readonly agentId?: AgentId;
    /** Standard deviations above mean to trigger alert */
    readonly stdDevThreshold: number;
    /** Minimum number of transactions before anomaly detection activates */
    readonly minSampleSize: number;
}
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
export declare class SpendAlerts {
    private readonly tracker;
    private readonly rules;
    private readonly handlers;
    private readonly knownRecipients;
    private readonly logger?;
    constructor(tracker: SpendTracker, options?: {
        logger?: Logger;
    });
    /**
     * Add an alert rule.
     */
    addRule(rule: AlertRule): void;
    /**
     * Remove an alert rule by ID.
     */
    removeRule(id: string): boolean;
    /**
     * Register an alert handler. Called whenever an alert fires.
     */
    onAlert(handler: AlertHandler): void;
    /**
     * Evaluate a transaction against all active alert rules.
     * Fires alerts to all registered handlers if conditions are met.
     */
    evaluate(tx: AgentTransaction): Promise<SpendAlert[]>;
    /**
     * Get all configured rules.
     */
    getRules(): AlertRule[];
    private checkRule;
    private checkBudgetThreshold;
    private checkLargeTransaction;
    private checkRateSpike;
    private checkNewRecipient;
    private checkAnomaly;
    private createAlert;
}
//# sourceMappingURL=alerts.d.ts.map