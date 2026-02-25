import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';
import type { PolicyId, PolicyAction, TimeWindow } from '@paysentry/core';

const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(100),
  conditions: z.object({
    agents: z.array(z.string()).optional(),
    recipients: z.array(z.string()).optional(),
    services: z.array(z.string()).optional(),
    protocols: z.array(z.string()).optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    currencies: z.array(z.string()).optional(),
  }),
  action: z.enum(['allow', 'deny', 'require_approval', 'flag']),
});

const BudgetSchema = z.object({
  window: z.enum(['per_transaction', 'hourly', 'daily', 'weekly', 'monthly']),
  maxAmount: z.number().positive(),
  currency: z.string().optional(),
});

export function registerPolicyTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'manage_policy',
    'CRUD operations on spending policies. Actions: list, get, create, delete. Agents can programmatically create their own spending rules.',
    {
      action: z.enum(['list', 'get', 'create', 'delete']).describe('Operation to perform'),
      policy_id: z.string().optional().describe('Policy ID (for get/delete)'),
      policy: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        enabled: z.boolean().default(true),
        rules: z.array(PolicyRuleSchema),
        budgets: z.array(BudgetSchema),
        cooldownMs: z.number().optional(),
      }).optional().describe('Policy definition (for create)'),
    },
    async ({ action, policy_id, policy }) => {
      switch (action) {
        case 'list': {
          const policies = stack.listPolicies();
          return { content: [{ type: 'text' as const, text: JSON.stringify(policies, null, 2) }] };
        }
        case 'get': {
          if (!policy_id) return { content: [{ type: 'text' as const, text: 'Error: policy_id required for get' }], isError: true };
          const p = stack.getPolicy(policy_id);
          if (!p) return { content: [{ type: 'text' as const, text: `Policy "${policy_id}" not found` }], isError: true };
          return { content: [{ type: 'text' as const, text: JSON.stringify(p, null, 2) }] };
        }
        case 'create': {
          if (!policy) return { content: [{ type: 'text' as const, text: 'Error: policy object required for create' }], isError: true };
          stack.createPolicy(policy as any);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, policyId: policy.id, message: `Policy "${policy.name}" created` }) }] };
        }
        case 'delete': {
          if (!policy_id) return { content: [{ type: 'text' as const, text: 'Error: policy_id required for delete' }], isError: true };
          const removed = stack.removePolicy(policy_id);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: removed, policyId: policy_id }) }] };
        }
      }
    }
  );

  // Separate dry-run tool for convenience
  server.tool(
    'evaluate_payment',
    'Dry-run: evaluate a hypothetical payment against current policies WITHOUT executing it. Returns allow/deny/require_approval.',
    {
      recipient: z.string().describe('Hypothetical recipient'),
      amount: z.number().positive().describe('Hypothetical amount'),
      currency: z.string().default('USD').describe('Currency'),
    },
    async ({ recipient, amount, currency }) => {
      const evaluation = stack.evaluateDryRun(recipient, amount, currency);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(evaluation, null, 2) }],
      };
    }
  );
}
