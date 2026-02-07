// =============================================================================
// 01-observe.ts — Payment Observability
//
// Demonstrates the Observe pillar: SpendTracker, SpendAnalytics, SpendAlerts
// Track every dollar, analyze spending patterns, alert on anomalies.
//
// Run: npx tsx examples/01-observe.ts
// =============================================================================

import type { AgentId, ServiceId } from '@paysentry/core';
import { createTransaction } from '@paysentry/core';
import { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';

// =============================================================================
// 1. SpendTracker — Record and query transactions
// =============================================================================

console.log('=== SpendTracker ===\n');

const tracker = new SpendTracker();

// Record a batch of agent transactions
const transactions = [
  createTransaction({
    agentId: 'data-agent' as AgentId,
    recipient: 'https://api.openai.com/v1/chat',
    amount: 0.05,
    currency: 'USDC',
    purpose: 'GPT-4 call: summarize quarterly report',
    protocol: 'x402',
    service: 'openai' as ServiceId,
  }),
  createTransaction({
    agentId: 'data-agent' as AgentId,
    recipient: 'https://api.anthropic.com/v1/messages',
    amount: 0.03,
    currency: 'USDC',
    purpose: 'Claude call: extract key metrics',
    protocol: 'x402',
    service: 'anthropic' as ServiceId,
  }),
  createTransaction({
    agentId: 'data-agent' as AgentId,
    recipient: 'https://api.openai.com/v1/chat',
    amount: 0.08,
    currency: 'USDC',
    purpose: 'GPT-4 call: generate data visualization',
    protocol: 'x402',
    service: 'openai' as ServiceId,
  }),
  createTransaction({
    agentId: 'trading-agent' as AgentId,
    recipient: 'https://api.coingecko.com/v3/coins',
    amount: 0.01,
    currency: 'USDC',
    purpose: 'Fetch latest crypto prices',
    protocol: 'x402',
    service: 'coingecko' as ServiceId,
  }),
];

// Mark as completed and record
for (const tx of transactions) {
  tx.status = 'completed';
  tracker.record(tx);
}

console.log(`Recorded ${tracker.size} transactions`);
console.log(`Active agents: ${tracker.agents.join(', ')}`);
console.log(`Unique recipients: ${tracker.recipients.length}`);

// Query: all transactions for a specific agent
const agentTxs = tracker.getByAgent('data-agent' as AgentId);
console.log(`\ndata-agent transactions: ${agentTxs.length}`);

// Query: filter by service
const openaiTxs = tracker.getByService('openai' as ServiceId);
console.log(`OpenAI transactions: ${openaiTxs.length}`);

// Query: filter with multiple criteria
const filtered = tracker.query({
  agentId: 'data-agent' as AgentId,
  currency: 'USDC',
  minAmount: 0.05,
});
console.log(`data-agent transactions >= $0.05: ${filtered.length}`);

// =============================================================================
// 2. SpendAnalytics — Compute insights from transaction data
// =============================================================================

console.log('\n=== SpendAnalytics ===\n');

const analytics = new SpendAnalytics(tracker);

// Per-agent analytics
const report = analytics.getAgentAnalytics('data-agent' as AgentId);
const usdcSummary = report.spendByCurrency.get('USDC');

console.log('data-agent USDC Summary:');
console.log(`  Total spend:  $${usdcSummary?.totalAmount}`);
console.log(`  Transactions: ${usdcSummary?.transactionCount}`);
console.log(`  Average:      $${usdcSummary?.averageAmount}`);
console.log(`  Max single:   $${usdcSummary?.maxAmount}`);
console.log(`  Min single:   $${usdcSummary?.minAmount}`);

// Top recipients
console.log(`\nTop recipients:`);
for (const r of report.topRecipients) {
  console.log(`  ${r.recipient} — $${r.totalAmount} (${r.count} txs)`);
}

// Agent leaderboard
const leaderboard = analytics.getAgentLeaderboard('USDC');
console.log('\nAgent Leaderboard (USDC):');
for (const entry of leaderboard) {
  console.log(`  ${entry.agentId}: $${entry.totalAmount} (${entry.count} txs)`);
}

// Total platform spend
const totalSpend = analytics.getTotalSpend('USDC');
console.log(`\nTotal platform USDC spend: $${totalSpend.totalAmount}`);

// =============================================================================
// 3. SpendAlerts — Real-time alerts on spending conditions
// =============================================================================

console.log('\n=== SpendAlerts ===\n');

const alerts = new SpendAlerts(tracker);

// Rule 1: Budget threshold — alert when 80% of $1 daily USDC budget is used
alerts.addRule({
  id: 'daily-budget',
  name: 'Daily USDC Budget',
  type: 'budget_threshold',
  severity: 'warning',
  enabled: true,
  config: {
    type: 'budget_threshold',
    threshold: 1.0,
    currency: 'USDC',
    windowMs: 86400000, // 24 hours
    alertAtPercent: 0.8,
  },
});

// Rule 2: Large transaction — alert on any single tx above $0.50
alerts.addRule({
  id: 'large-tx',
  name: 'Large Transaction Alert',
  type: 'large_transaction',
  severity: 'critical',
  enabled: true,
  config: {
    type: 'large_transaction',
    threshold: 0.50,
    currency: 'USDC',
  },
});

// Rule 3: New recipient detection
alerts.addRule({
  id: 'new-recipient',
  name: 'New Recipient Alert',
  type: 'new_recipient',
  severity: 'info',
  enabled: true,
  config: {
    type: 'new_recipient',
  },
});

// Register alert handler
alerts.onAlert((alert) => {
  console.log(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
});

// Evaluate a new transaction that triggers the large transaction alert
const largeTx = createTransaction({
  agentId: 'data-agent' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 0.75,
  currency: 'USDC',
  purpose: 'Large batch analysis',
  protocol: 'x402',
});

console.log('Evaluating $0.75 transaction...');
const firedAlerts = await alerts.evaluate(largeTx);
console.log(`  Alerts triggered: ${firedAlerts.length}`);

// Evaluate a transaction to a brand new recipient
const newRecipientTx = createTransaction({
  agentId: 'data-agent' as AgentId,
  recipient: 'https://api.perplexity.ai/search',
  amount: 0.02,
  currency: 'USDC',
  purpose: 'Web search query',
  protocol: 'x402',
});

console.log('\nEvaluating transaction to new recipient...');
const newRecipientAlerts = await alerts.evaluate(newRecipientTx);
console.log(`  Alerts triggered: ${newRecipientAlerts.length}`);

// List all configured rules
console.log(`\nConfigured alert rules: ${alerts.getRules().length}`);
for (const rule of alerts.getRules()) {
  console.log(`  - ${rule.name} (${rule.type}, ${rule.severity})`);
}
