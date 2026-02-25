import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';

export function registerPayTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'pay',
    'Initiate a payment. Evaluated against spending policies before execution. Returns structured JSON with status, transaction ID, and any triggered alerts.',
    {
      recipient: z.string().describe('Payment recipient — URL, service name, or wallet address'),
      amount: z.number().positive().describe('Payment amount'),
      currency: z.string().default('USD').describe('Currency code'),
      reason: z.string().describe('Purpose of the payment'),
      agent_id: z.string().optional().describe('Agent ID (uses default if omitted)'),
    },
    async ({ recipient, amount, currency, reason, agent_id }) => {
      const result = await stack.processPayment(recipient, amount, currency, reason, agent_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        isError: !result.success,
      };
    }
  );
}
