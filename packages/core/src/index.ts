// =============================================================================
// @paysentry/core — Public API
// Core types, utilities, and shared infrastructure for PaySentry
// =============================================================================

// All types
export type {
  // Identifiers
  TransactionId,
  AgentId,
  PolicyId,
  DisputeId,
  ServiceId,
  IntentId,
  MandateId,
  EscrowId,

  // Transaction
  PaymentProtocol,
  TransactionStatus,
  AgentTransaction,

  // Policy
  TimeWindow,
  PolicyAction,
  PolicyRule,
  PolicyCondition,
  SpendPolicy,
  BudgetLimit,
  PolicyEvaluation,

  // Agent Identity
  AgentCapability,
  AgentProfile,

  // Payment Intent (A2A)
  IntentStatus,
  PaymentIntent,
  PaymentCondition,

  // Mandate (A2A)
  MandateStatus,
  AgentMandate,

  // Escrow (A2A)
  EscrowStatus,
  EscrowContract,

  // Dispute
  DisputeStatus,
  LiabilityAttribution,
  DisputeCase,
  DisputeEvidence,

  // Provenance
  ProvenanceRecord,

  // Alerts
  AlertSeverity,
  AlertType,
  SpendAlert,

  // Configuration
  Logger,
  AlertHandler,
  ApprovalHandler,

  // Sandbox
  MockEndpointConfig,
  MockPaymentResult,
  TestScenario,
} from './types.js';

// Utility functions
export { generateId, generateTransactionId, generateDisputeId } from './utils.js';
export { createTransaction } from './factory.js';
export type { CreateTransactionInput } from './factory.js';
export { matchesGlob } from './glob.js';

// Storage
export type { StorageAdapter, StorageFilter } from './storage.js';
export { MemoryStorage } from './storage.js';

// Events
export type { PaySentryEvent, PaySentryEventType } from './events.js';
export { EventBus } from './events.js';
