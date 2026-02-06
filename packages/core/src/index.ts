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
export { matchesGlob } from './glob.js';
