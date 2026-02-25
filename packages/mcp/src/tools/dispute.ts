import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PaySentryStack } from '../stack.js';

export function registerDisputeTool(server: McpServer, stack: PaySentryStack): void {
  server.tool(
    'file_dispute',
    'File a dispute against a completed transaction. Returns the dispute case with ID and status.',
    {
      transaction_id: z.string().describe('Transaction ID to dispute'),
      reason: z.string().describe('Reason for the dispute (e.g., "duplicate_charge", "service_not_delivered", "unauthorized")'),
    },
    async ({ transaction_id, reason }) => {
      try {
        const dispute = stack.fileDispute(transaction_id, reason);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(dispute, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error filing dispute: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'list_disputes',
    'List dispute cases, optionally filtered by status.',
    {
      status: z.enum(['open', 'investigating', 'resolved_refunded', 'resolved_denied', 'resolved_partial', 'escalated']).optional().describe('Filter by dispute status'),
    },
    async ({ status }) => {
      const disputes = stack.listDisputes(status);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(disputes, null, 2) }],
      };
    }
  );
}
