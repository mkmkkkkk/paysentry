// =============================================================================
// @paysentry/observe — Public API
// Payment observability for AI agents
// =============================================================================

export { SpendTracker } from './tracker.js';
export type { TransactionFilter } from './tracker.js';

export { SpendAnalytics } from './analytics.js';
export type { SpendSummary, TimeSeriesPoint, AgentAnalytics } from './analytics.js';

export { SpendAlerts } from './alerts.js';
export type {
  AlertRule,
  AlertRuleConfig,
  BudgetThresholdConfig,
  LargeTransactionConfig,
  RateSpikeConfig,
  NewRecipientConfig,
  AnomalyConfig,
} from './alerts.js';
