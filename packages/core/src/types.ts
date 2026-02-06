// =============================================================================
// PaySentry Core Types
// The foundational type system for the AI agent payment control plane
// =============================================================================

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Branded string types for type-safe identifiers */
export type TransactionId = string & { readonly __brand: 'TransactionId' };
export type AgentId = string & { readonly __brand: 'AgentId' };
export type PolicyId = string & { readonly __brand: 'PolicyId' };
export type DisputeId = string & { readonly __brand: 'DisputeId' };
export type ServiceId = string & { readonly __brand: 'ServiceId' };

// ---------------------------------------------------------------------------
// Agent Transaction — the universal unit of work
// ---------------------------------------------------------------------------

/** Supported payment protocols */
export type PaymentProtocol = 'x402' | 'acp' | 'ap2' | 'stripe' | 'custom';

/** Transaction lifecycle status */
export type TransactionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'disputed'
  | 'refunded';

/**
 * AgentTransaction represents a single payment action by an AI agent.
 * This is the core data structure that flows through all PaySentry pillars.
 */
export interface AgentTransaction {
  /** Unique transaction identifier (format: ps_<hex_timestamp>_<random>) */
  readonly id: TransactionId;

  /** The agent initiating the payment */
  readonly agentId: AgentId;

  /** Recipient address, URI, or service identifier */
  readonly recipient: string;

  /** Payment amount in the specified currency */
  readonly amount: number;

  /** Currency identifier (e.g., 'USDC', 'ETH', 'USD') */
  readonly currency: string;

  /** Human-readable purpose of the payment */
  readonly purpose: string;

  /** Payment protocol used or to be used */
  readonly protocol: PaymentProtocol;

  /** Current transaction status */
  status: TransactionStatus;

  /** Service or category the payment belongs to */
  readonly service?: ServiceId;

  /** ISO 8601 timestamp of creation */
  readonly createdAt: string;

  /** ISO 8601 timestamp of last update */
  updatedAt: string;

  /** Protocol-specific transaction hash or ID */
  protocolTxId?: string;

  /** Arbitrary metadata attached by the agent or system */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Spend Policy — declarative rules for controlling agent payments
// ---------------------------------------------------------------------------

/** Time window for budget calculations */
export type TimeWindow = 'per_transaction' | 'hourly' | 'daily' | 'weekly' | 'monthly';

/** What happens when a policy rule is triggered */
export type PolicyAction = 'allow' | 'deny' | 'require_approval' | 'flag';

/**
 * A single rule within a spend policy.
 * Rules are evaluated in order; first match wins.
 */
export interface PolicyRule {
  /** Unique rule identifier */
  readonly id: string;

  /** Human-readable rule name */
  readonly name: string;

  /** Optional description */
  readonly description?: string;

  /** Whether the rule is active */
  readonly enabled: boolean;

  /** Priority (lower number = evaluated first) */
  readonly priority: number;

  /** Conditions that trigger this rule */
  readonly conditions: PolicyCondition;

  /** Action to take when conditions match */
  readonly action: PolicyAction;
}

/**
 * Conditions under which a policy rule applies.
 * All specified conditions must be true (AND logic).
 * Unspecified conditions are treated as "any".
 */
export interface PolicyCondition {
  /** Match specific agents (glob patterns supported) */
  readonly agents?: readonly string[];

  /** Match specific recipients (glob patterns supported) */
  readonly recipients?: readonly string[];

  /** Match specific services */
  readonly services?: readonly string[];

  /** Match specific protocols */
  readonly protocols?: readonly PaymentProtocol[];

  /** Amount threshold (transaction amount must be >= this value) */
  readonly minAmount?: number;

  /** Amount ceiling (transaction amount must be <= this value) */
  readonly maxAmount?: number;

  /** Match specific currencies */
  readonly currencies?: readonly string[];

  /** Match metadata key-value pairs */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * SpendPolicy is a complete policy definition containing ordered rules
 * and budget limits.
 */
export interface SpendPolicy {
  /** Unique policy identifier */
  readonly id: PolicyId;

  /** Human-readable policy name */
  readonly name: string;

  /** Optional description */
  readonly description?: string;

  /** Ordered list of rules (evaluated by priority, then array order) */
  readonly rules: readonly PolicyRule[];

  /** Budget limits keyed by time window */
  readonly budgets: readonly BudgetLimit[];

  /** Cooldown between transactions in milliseconds */
  readonly cooldownMs?: number;

  /** Whether this policy is active */
  readonly enabled: boolean;
}

/**
 * BudgetLimit defines a spending cap over a time window,
 * optionally scoped to specific agents, services, or protocols.
 */
export interface BudgetLimit {
  /** Time window for this budget */
  readonly window: TimeWindow;

  /** Maximum amount allowed in this window */
  readonly maxAmount: number;

  /** Currency this limit applies to (default: all) */
  readonly currency?: string;

  /** Scope to specific agents (default: all) */
  readonly agentIds?: readonly string[];

  /** Scope to specific services (default: all) */
  readonly serviceIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Dispute Case — for the Protect pillar
// ---------------------------------------------------------------------------

/** Dispute lifecycle status */
export type DisputeStatus =
  | 'open'
  | 'investigating'
  | 'resolved_refunded'
  | 'resolved_denied'
  | 'resolved_partial'
  | 'escalated';

/** Who is at fault in a dispute */
export type LiabilityAttribution =
  | 'agent'
  | 'service_provider'
  | 'protocol'
  | 'user'
  | 'undetermined';

/**
 * DisputeCase tracks the lifecycle of a payment dispute,
 * from initial filing through investigation to resolution.
 */
export interface DisputeCase {
  /** Unique dispute identifier */
  readonly id: DisputeId;

  /** Transaction being disputed */
  readonly transactionId: TransactionId;

  /** Agent that initiated the original transaction */
  readonly agentId: AgentId;

  /** Reason for the dispute */
  readonly reason: string;

  /** Current dispute status */
  status: DisputeStatus;

  /** Who is determined to be at fault */
  liability: LiabilityAttribution;

  /** Amount requested for refund */
  readonly requestedAmount: number;

  /** Amount actually refunded (if resolved) */
  resolvedAmount?: number;

  /** ISO 8601 timestamp of dispute creation */
  readonly createdAt: string;

  /** ISO 8601 timestamp of last update */
  updatedAt: string;

  /** ISO 8601 timestamp of resolution */
  resolvedAt?: string;

  /** Evidence and investigation notes */
  evidence: readonly DisputeEvidence[];
}

/**
 * A piece of evidence attached to a dispute case.
 */
export interface DisputeEvidence {
  /** Type of evidence */
  readonly type: 'transaction_log' | 'agent_trace' | 'provenance_record' | 'user_statement' | 'system_log';

  /** Human-readable description */
  readonly description: string;

  /** The evidence data */
  readonly data: unknown;

  /** ISO 8601 timestamp */
  readonly addedAt: string;
}

// ---------------------------------------------------------------------------
// Provenance — full audit trail
// ---------------------------------------------------------------------------

/** A single step in the transaction provenance chain */
export interface ProvenanceRecord {
  /** Transaction this record belongs to */
  readonly transactionId: TransactionId;

  /** What stage of the pipeline produced this record */
  readonly stage: 'intent' | 'policy_check' | 'approval' | 'execution' | 'settlement' | 'dispute';

  /** ISO 8601 timestamp */
  readonly timestamp: string;

  /** What happened at this stage */
  readonly action: string;

  /** Outcome of the action */
  readonly outcome: 'pass' | 'fail' | 'pending';

  /** Stage-specific details */
  readonly details: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Policy Evaluation Result
// ---------------------------------------------------------------------------

/**
 * Result of evaluating a transaction against the policy engine.
 */
export interface PolicyEvaluation {
  /** Whether the transaction is allowed */
  readonly allowed: boolean;

  /** The action determined by policy evaluation */
  readonly action: PolicyAction;

  /** Which rule triggered this result (if any) */
  readonly triggeredRule?: PolicyRule;

  /** Human-readable reason */
  readonly reason: string;

  /** Detailed evaluation metadata */
  readonly details: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Alert — for the Observe pillar
// ---------------------------------------------------------------------------

/** Alert severity levels */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/** Alert types for spend monitoring */
export type AlertType =
  | 'budget_threshold'
  | 'anomaly_detected'
  | 'rate_spike'
  | 'new_recipient'
  | 'large_transaction'
  | 'policy_violation';

/**
 * SpendAlert represents a notification triggered by the observability layer.
 */
export interface SpendAlert {
  /** Alert type */
  readonly type: AlertType;

  /** Severity level */
  readonly severity: AlertSeverity;

  /** Human-readable message */
  readonly message: string;

  /** ISO 8601 timestamp */
  readonly timestamp: string;

  /** Related agent (if applicable) */
  readonly agentId?: AgentId;

  /** Related transaction (if applicable) */
  readonly transactionId?: TransactionId;

  /** Alert-specific data */
  readonly data: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Logger interface for pluggable logging.
 */
export interface Logger {
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

/**
 * Alert handler callback type.
 */
export type AlertHandler = (alert: SpendAlert) => void | Promise<void>;

/**
 * Approval handler callback type.
 * Returns true if the transaction is approved, false if rejected.
 */
export type ApprovalHandler = (transaction: AgentTransaction) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Sandbox Types
// ---------------------------------------------------------------------------

/** Mock protocol endpoint configuration */
export interface MockEndpointConfig {
  /** Protocol to mock */
  readonly protocol: PaymentProtocol;

  /** Simulated latency in milliseconds */
  readonly latencyMs?: number;

  /** Failure rate (0.0 to 1.0) */
  readonly failureRate?: number;

  /** Custom response handler */
  readonly handler?: (transaction: AgentTransaction) => Promise<MockPaymentResult>;
}

/** Result from a mock payment execution */
export interface MockPaymentResult {
  /** Whether the mock payment succeeded */
  readonly success: boolean;

  /** Mock transaction ID */
  readonly txId: string;

  /** Error message if failed */
  readonly error?: string;

  /** Simulated settlement time in milliseconds */
  readonly settlementMs?: number;
}

// ---------------------------------------------------------------------------
// Test Scenario
// ---------------------------------------------------------------------------

/** A pre-built test scenario for the sandbox */
export interface TestScenario {
  /** Scenario name */
  readonly name: string;

  /** Description of what this scenario tests */
  readonly description: string;

  /** Transactions to execute in order */
  readonly transactions: readonly Omit<AgentTransaction, 'id' | 'status' | 'createdAt' | 'updatedAt'>[];

  /** Expected outcomes for each transaction */
  readonly expectedOutcomes: readonly TransactionStatus[];
}
