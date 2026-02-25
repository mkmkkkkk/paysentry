#!/usr/bin/env node
// =============================================================================
// paysentry-mcp CLI — run the MCP server via stdio
//
// Usage:
//   npx paysentry-mcp
//   npx @paysentry/mcp
//
// Environment variables (all optional):
//   PAYSENTRY_MAX_PER_TX      — Max per transaction (default: 100)
//   PAYSENTRY_MAX_DAILY       — Max daily spend (default: 500)
//   PAYSENTRY_MAX_HOURLY      — Max hourly spend (default: 200)
//   PAYSENTRY_APPROVAL_ABOVE  — Approval threshold (default: 50)
//   PAYSENTRY_INITIAL_BALANCE — Starting balance (default: 10000)
//   PAYSENTRY_CURRENCY        — Currency code (default: USD)
// =============================================================================

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { AgentId, PolicyId } from '@paysentry/core';
import { createPaySentryMcpServer } from './server.js';
import { DEFAULT_CONFIG } from './stack.js';

const env = process.env;
const currency = env.PAYSENTRY_CURRENCY ?? DEFAULT_CONFIG.policy.currency;

const { server, stack } = createPaySentryMcpServer({
  policy: {
    id: DEFAULT_CONFIG.policy.id,
    maxPerTransaction: parseFloat(env.PAYSENTRY_MAX_PER_TX ?? '') || DEFAULT_CONFIG.policy.maxPerTransaction,
    maxDaily: parseFloat(env.PAYSENTRY_MAX_DAILY ?? '') || DEFAULT_CONFIG.policy.maxDaily,
    maxHourly: parseFloat(env.PAYSENTRY_MAX_HOURLY ?? '') || DEFAULT_CONFIG.policy.maxHourly,
    approvalThreshold: parseFloat(env.PAYSENTRY_APPROVAL_ABOVE ?? '') || DEFAULT_CONFIG.policy.approvalThreshold,
    currency,
  },
  alerts: { ...DEFAULT_CONFIG.alerts, currency },
  sandbox: {
    ...DEFAULT_CONFIG.sandbox,
    initialBalance: parseFloat(env.PAYSENTRY_INITIAL_BALANCE ?? '') || DEFAULT_CONFIG.sandbox.initialBalance,
  },
});

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`\n  PaySentry MCP Server v${stack.config.serverVersion}\n`);
process.stderr.write(`  Tools: pay, check_balance, payment_history, discover_capabilities,\n`);
process.stderr.write(`         manage_policy, evaluate_payment, file_dispute, list_disputes,\n`);
process.stderr.write(`         get_audit_trail, get_alerts\n`);
process.stderr.write(`  Max/tx: $${stack.config.policy.maxPerTransaction} | Daily: $${stack.config.policy.maxDaily} | Balance: $${stack.config.sandbox.initialBalance}\n`);
process.stderr.write(`  Ready.\n\n`);
