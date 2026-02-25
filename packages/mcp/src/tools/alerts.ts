import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';

export function registerAlertsTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'get_alerts',
    'Get all alerts triggered during this session. Includes budget warnings, large transactions, rate spikes, new recipients, and anomalies.',
    {
      limit: z.number().int().positive().max(100).default(50).describe('Max alerts to return'),
    },
    async ({ limit }) => {
      const alerts = stack.getAlertLog().slice(-limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ alerts, count: alerts.length }, null, 2) }],
      };
    }
  );
}
