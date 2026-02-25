import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';
import type { CapabilityManifest } from '../types.js';

/**
 * The most agent-critical tool. An agent calls this once and knows
 * everything about this PaySentry server: tools, limits, budgets, features.
 */
export function registerDiscoverTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'discover_capabilities',
    'Returns a structured manifest of everything this payment server can do: all tools, current policies, budget utilization, supported protocols. Call this first to understand the server.',
    {},
    async () => {
      const balance = stack.getBalanceInfo();
      const policies = stack.listPolicies();

      const manifest: CapabilityManifest = {
        version: stack.config.serverVersion,
        serverName: stack.config.serverName,
        tools: [
          { name: 'pay', description: 'Initiate a payment with policy enforcement', parameters: ['recipient', 'amount', 'currency', 'reason', 'agent_id?'] },
          { name: 'check_balance', description: 'Get wallet balance and budget utilization', parameters: [] },
          { name: 'payment_history', description: 'Get transaction history', parameters: ['limit?', 'agent_id?'] },
          { name: 'discover_capabilities', description: 'This tool — returns server capabilities', parameters: [] },
          { name: 'manage_policy', description: 'CRUD operations on spending policies', parameters: ['action', '...action-specific params'] },
          { name: 'evaluate_payment', description: 'Dry-run a payment against policies without executing', parameters: ['recipient', 'amount', 'currency'] },
          { name: 'file_dispute', description: 'File a dispute against a transaction', parameters: ['transaction_id', 'reason'] },
          { name: 'list_disputes', description: 'List dispute cases', parameters: ['status?'] },
          { name: 'get_audit_trail', description: 'Get full provenance chain for a transaction', parameters: ['transaction_id'] },
          { name: 'get_alerts', description: 'Get triggered alerts', parameters: ['limit?'] },
        ],
        protocols: ['x402', 'acp', 'ap2'],
        currencies: [stack.config.policy.currency],
        features: [
          'policy_engine',
          'spend_tracking',
          'budget_enforcement',
          'anomaly_detection',
          'dispute_resolution',
          'provenance_chain',
          'circuit_breaker',
          'dry_run_evaluation',
          'real_time_alerts',
        ],
        limits: {
          maxPerTransaction: stack.config.policy.maxPerTransaction,
          dailyCap: stack.config.policy.maxDaily,
          hourlyCap: stack.config.policy.maxHourly,
          approvalThreshold: stack.config.policy.approvalThreshold,
        },
        budgetUtilization: {
          daily: balance.dailyBudget,
          hourly: balance.hourlyBudget,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(manifest, null, 2) }],
      };
    }
  );
}
