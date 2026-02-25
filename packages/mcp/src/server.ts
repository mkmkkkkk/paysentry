// =============================================================================
// @paysentry/mcp — MCP Server factory
// Creates a fully configured MCP server with all PaySentry tools
// =============================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PaySentryStack, DEFAULT_CONFIG } from './stack.js';
import type { McpServerConfig } from './types.js';

import { registerPayTool } from './tools/pay.js';
import { registerBalanceTool } from './tools/balance.js';
import { registerHistoryTool } from './tools/history.js';
import { registerDiscoverTool } from './tools/discover.js';
import { registerPolicyTool } from './tools/policy.js';
import { registerDisputeTool } from './tools/dispute.js';
import { registerProvenanceTool } from './tools/provenance.js';
import { registerAlertsTool } from './tools/alerts.js';

export interface CreateServerResult {
  server: McpServer;
  stack: PaySentryStack;
}

/**
 * Create a fully configured PaySentry MCP server.
 *
 * @example
 * ```ts
 * import { createPaySentryMcpServer } from '@paysentry/mcp';
 * import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
 *
 * const { server } = createPaySentryMcpServer();
 * await server.connect(new StdioServerTransport());
 * ```
 */
export function createPaySentryMcpServer(config?: Partial<McpServerConfig>): CreateServerResult {
  const fullConfig: McpServerConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    policy: { ...DEFAULT_CONFIG.policy, ...config?.policy },
    alerts: { ...DEFAULT_CONFIG.alerts, ...config?.alerts },
    sandbox: { ...DEFAULT_CONFIG.sandbox, ...config?.sandbox },
  };

  const stack = new PaySentryStack(fullConfig);

  const server = new McpServer({
    name: fullConfig.serverName,
    version: fullConfig.serverVersion,
  });

  // Register all tools
  registerPayTool(server, stack);
  registerBalanceTool(server, stack);
  registerHistoryTool(server, stack);
  registerDiscoverTool(server, stack);
  registerPolicyTool(server, stack);
  registerDisputeTool(server, stack);
  registerProvenanceTool(server, stack);
  registerAlertsTool(server, stack);

  return { server, stack };
}
