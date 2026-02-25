// =============================================================================
// @paysentry/mcp — Types
// =============================================================================

import type { AgentId, PolicyId } from '@paysentry/core';

export interface McpServerConfig {
  readonly serverName: string;
  readonly serverVersion: string;
  readonly defaultAgentId: AgentId;
  readonly policy: {
    readonly id: PolicyId;
    readonly maxPerTransaction: number;
    readonly maxDaily: number;
    readonly maxHourly: number;
    readonly approvalThreshold: number;
    readonly currency: string;
  };
  readonly alerts: {
    readonly largeTransactionThreshold: number;
    readonly rateSpikeMaxPerMinute: number;
    readonly currency: string;
  };
  readonly sandbox: {
    readonly latencyMs: number;
    readonly failureRate: number;
    readonly initialBalance: number;
  };
}

export interface WalletState {
  balance: number;
  readonly currency: string;
  totalSpent: number;
  transactionCount: number;
}

export interface PaymentResult {
  readonly success: boolean;
  readonly transactionId?: string;
  readonly status: 'completed' | 'blocked' | 'requires_approval';
  readonly message: string;
  readonly policyDetails?: {
    readonly action: string;
    readonly reason: string;
    readonly triggeredRule?: string;
  };
  readonly alerts?: string[];
}

/**
 * Capability manifest returned by the discover tool.
 * Machine-readable description of everything this server can do.
 */
export interface CapabilityManifest {
  readonly version: string;
  readonly serverName: string;
  readonly tools: readonly ToolDescription[];
  readonly protocols: readonly string[];
  readonly currencies: readonly string[];
  readonly features: readonly string[];
  readonly limits: {
    readonly maxPerTransaction: number | null;
    readonly dailyCap: number | null;
    readonly hourlyCap: number | null;
    readonly approvalThreshold: number | null;
  };
  readonly budgetUtilization: {
    readonly daily: { used: number; limit: number; remaining: number };
    readonly hourly: { used: number; limit: number; remaining: number };
  };
}

export interface ToolDescription {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly string[];
}
