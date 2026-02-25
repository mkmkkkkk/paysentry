// =============================================================================
// @paysentry/mcp — Public API
// MCP server for AI agent payment controls
// =============================================================================

export { createPaySentryMcpServer } from './server.js';
export type { CreateServerResult } from './server.js';
export { PaySentryStack, DEFAULT_CONFIG } from './stack.js';
export type { McpServerConfig, WalletState, PaymentResult, CapabilityManifest, ToolDescription } from './types.js';
