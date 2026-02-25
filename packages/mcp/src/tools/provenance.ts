import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';

export function registerProvenanceTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'get_audit_trail',
    'Get the full provenance chain for a transaction: intent → policy_check → approval → execution → settlement. Immutable audit trail.',
    {
      transaction_id: z.string().describe('Transaction ID to trace'),
    },
    async ({ transaction_id }) => {
      const chain = stack.getAuditTrail(transaction_id);
      if (chain.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No provenance records found for transaction "${transaction_id}"` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(chain, null, 2) }],
      };
    }
  );
}
