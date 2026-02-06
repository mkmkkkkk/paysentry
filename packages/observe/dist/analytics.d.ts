import type { AgentTransaction, AgentId, TimeWindow } from '@paysentry/core';
import type { SpendTracker } from './tracker.js';
/** Aggregated spend summary for a single entity */
export interface SpendSummary {
    /** Total amount spent */
    readonly totalAmount: number;
    /** Number of transactions */
    readonly transactionCount: number;
    /** Average transaction amount */
    readonly averageAmount: number;
    /** Largest single transaction */
    readonly maxAmount: number;
    /** Smallest single transaction */
    readonly minAmount: number;
    /** Currency (summaries are per-currency) */
    readonly currency: string;
}
/** Spend breakdown by time period */
export interface TimeSeriesPoint {
    /** ISO 8601 period start */
    readonly periodStart: string;
    /** ISO 8601 period end */
    readonly periodEnd: string;
    /** Total spend in this period */
    readonly totalAmount: number;
    /** Number of transactions */
    readonly transactionCount: number;
}
/** Complete analytics snapshot for an agent */
export interface AgentAnalytics {
    /** Agent identifier */
    readonly agentId: AgentId;
    /** Spend by currency */
    readonly spendByCurrency: ReadonlyMap<string, SpendSummary>;
    /** Spend by service */
    readonly spendByService: ReadonlyMap<string, SpendSummary>;
    /** Spend by protocol */
    readonly spendByProtocol: ReadonlyMap<string, SpendSummary>;
    /** Top recipients by total spend */
    readonly topRecipients: readonly {
        recipient: string;
        totalAmount: number;
        count: number;
    }[];
    /** Time series data */
    readonly timeSeries: readonly TimeSeriesPoint[];
}
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
export declare class SpendAnalytics {
    private readonly tracker;
    constructor(tracker: SpendTracker);
    /**
     * Compute a spend summary from a set of transactions.
     */
    summarize(transactions: readonly AgentTransaction[], currency: string): SpendSummary;
    /**
     * Get comprehensive analytics for a specific agent.
     *
     * @param agentId - Agent to analyze
     * @param timeWindow - Granularity for time series data
     * @param since - Only consider transactions after this ISO 8601 timestamp
     */
    getAgentAnalytics(agentId: AgentId, timeWindow?: TimeWindow, since?: string): AgentAnalytics;
    /**
     * Get the total spend across all agents within a time range.
     */
    getTotalSpend(currency: string, since?: string, until?: string): SpendSummary;
    /**
     * Get a leaderboard of agents by total spend.
     */
    getAgentLeaderboard(currency: string, limit?: number): {
        agentId: AgentId;
        totalAmount: number;
        count: number;
    }[];
    private groupBy;
    private buildTimeSeries;
    private getPeriodKey;
    private getNextPeriod;
}
//# sourceMappingURL=analytics.d.ts.map