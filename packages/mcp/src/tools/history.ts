import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';

export function registerHistoryTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'payment_history',
    'Get transaction history with optional filters. Returns structured JSON array of transactions.',
    {
      limit: z.number().int().positive().max(100).default(20).describe('Max transactions to return'),
      agent_id: z.string().optional().describe('Filter by agent ID'),
    },
    async ({ limit, agent_id }) => {
      const history = stack.getPaymentHistory(limit, agent_id);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(history, null, 2) }],
      };
    }
  );
}
