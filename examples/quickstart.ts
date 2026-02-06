// =============================================================================
// PaySentry Quickstart — All 4 pillars in 5 minutes
// =============================================================================

import type { AgentId, PolicyId, ServiceId } from '@paysentry/core';
import { createTransaction } from '@paysentry/core';

// Observe
import { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';

// Control
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';

// Protect
import { TransactionProvenance, DisputeManager, RecoveryEngine } from '@paysentry/protect';

// Sandbox (Test)
import { MockX402, MockACP, SCENARIO_OVERSPEND } from '@paysentry/sandbox';

// =============================================================================
// 1. OBSERVE — Track what agents spend
// =============================================================================

console.log('\n--- OBSERVE: Payment Observability ---\n');

const tracker = new SpendTracker();
const analytics = new SpendAnalytics(tracker);
const alerts = new SpendAlerts(tracker);

// Set up a budget threshold alert
alerts.addRule({
  id: 'daily-budget-alert',
  name: 'Daily USDC Budget Alert',
  type: 'budget_threshold',
  severity: 'warning',
  enabled: true,
  config: {
    type: 'budget_threshold',
    threshold: 100,
    currency: 'USDC',
    windowMs: 86400000, // 24 hours
    alertAtPercent: 0.8,
  },
});

alerts.onAlert((alert) => {
  console.log(`  [ALERT] ${alert.severity}: ${alert.message}`);
});

// Create and track some transactions
const tx1 = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 0.05,
  currency: 'USDC',
  purpose: 'GPT-4 API call for market research',
  protocol: 'x402',
  service: 'openai' as ServiceId,
});

tx1.status = 'completed';
tracker.record(tx1);

const tx2 = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://api.anthropic.com/v1/messages',
  amount: 0.03,
  currency: 'USDC',
  purpose: 'Claude API call for data analysis',
  protocol: 'x402',
  service: 'anthropic' as ServiceId,
});

tx2.status = 'completed';
tracker.record(tx2);

// Analyze spending
const agentReport = analytics.getAgentAnalytics('research-agent' as AgentId);
const usdcSummary = agentReport.spendByCurrency.get('USDC');
console.log(`  Agent: research-agent`);
console.log(`  Total USDC spend: $${usdcSummary?.totalAmount ?? 0}`);
console.log(`  Transactions: ${usdcSummary?.transactionCount ?? 0}`);
console.log(`  Top recipients:`, agentReport.topRecipients.map((r) => r.recipient));

// =============================================================================
// 2. CONTROL — Enforce spending policies
// =============================================================================

console.log('\n--- CONTROL: Policy Engine ---\n');

const policyEngine = new PolicyEngine();

policyEngine.loadPolicy({
  id: 'production' as PolicyId,
  name: 'Production Policy',
  description: 'Standard spending controls for production agents',
  enabled: true,
  rules: [
    blockAbove(1000, 'USDC'),                  // Hard block above $1000
    requireApprovalAbove(100, 'USDC'),          // Human approval above $100
    allowAll(),                                 // Allow everything else
  ],
  budgets: [
    { window: 'daily', maxAmount: 500, currency: 'USDC' },
    { window: 'monthly', maxAmount: 5000, currency: 'USDC' },
  ],
  cooldownMs: 1000, // 1 second between transactions
});

// Test policy evaluation
const smallTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://api.example.com/data',
  amount: 5.0,
  currency: 'USDC',
  purpose: 'Small data purchase',
  protocol: 'x402',
});

const smallResult = policyEngine.evaluate(smallTx);
console.log(`  $5 payment: ${smallResult.action} — ${smallResult.reason}`);

const largeTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://compute.example.com/train',
  amount: 250.0,
  currency: 'USDC',
  purpose: 'Model training run',
  protocol: 'x402',
});

const largeResult = policyEngine.evaluate(largeTx);
console.log(`  $250 payment: ${largeResult.action} — ${largeResult.reason}`);

const hugeTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://premium.example.com/dataset',
  amount: 2000.0,
  currency: 'USDC',
  purpose: 'Premium dataset',
  protocol: 'x402',
});

const hugeResult = policyEngine.evaluate(hugeTx);
console.log(`  $2000 payment: ${hugeResult.action} — ${hugeResult.reason}`);

// =============================================================================
// 3. PROTECT — Dispute resolution
// =============================================================================

console.log('\n--- PROTECT: Dispute Resolution ---\n');

const provenance = new TransactionProvenance();
const disputes = new DisputeManager({ provenance });

// Record the full lifecycle of a payment
const paymentTx = createTransaction({
  agentId: 'shopping-agent' as AgentId,
  recipient: 'https://flaky-service.com/api',
  amount: 25.0,
  currency: 'USDC',
  purpose: 'Purchase premium dataset',
  protocol: 'x402',
});

provenance.recordIntent(paymentTx);
provenance.recordPolicyCheck(paymentTx.id, 'pass', { policyId: 'production' });
provenance.recordExecution(paymentTx.id, 'pass', { txHash: '0xfake123' });
// Settlement fails — service didn't deliver
provenance.recordSettlement(paymentTx.id, 'fail', {
  reason: 'Service returned 500 after payment',
});

// File a dispute
const dispute = disputes.file({
  transactionId: paymentTx.id,
  agentId: paymentTx.agentId,
  reason: 'Service did not deliver after payment was confirmed',
  requestedAmount: paymentTx.amount,
});

console.log(`  Dispute filed: ${dispute.id}`);
console.log(`  Status: ${dispute.status}`);
console.log(`  Evidence records: ${dispute.evidence.length}`);

// Resolve the dispute
disputes.updateStatus(dispute.id, 'investigating');
const resolved = disputes.resolve(dispute.id, {
  status: 'resolved_refunded',
  liability: 'service_provider',
  resolvedAmount: 25.0,
});

console.log(`  Resolution: ${resolved.status}, liability: ${resolved.liability}`);
console.log(`  Refund amount: $${resolved.resolvedAmount}`);

// Recovery
const recovery = new RecoveryEngine({
  disputes,
  executor: async (action) => {
    // In production, this would execute the actual refund
    console.log(`  [Recovery] Executing refund of $${action.amount}...`);
    return { success: true, refundTxId: 'refund_mock_001' };
  },
});

const recoveryAction = recovery.initiate(dispute.id);
console.log(`  Recovery initiated: ${recoveryAction.id}`);

const processedActions = await recovery.processQueue();
console.log(`  Recovery status: ${processedActions[0]?.status}`);

// =============================================================================
// 4. TEST — Payment sandbox
// =============================================================================

console.log('\n--- TEST: Payment Sandbox ---\n');

const mockX402 = new MockX402({ latencyMs: 10 });
const mockACP = new MockACP({ latencyMs: 10 });

// Test x402 payment
const x402Tx = createTransaction({
  agentId: 'test-agent' as AgentId,
  recipient: 'https://api.example.com/resource',
  amount: 1.0,
  currency: 'USDC',
  purpose: 'Test x402 payment',
  protocol: 'x402',
});

const x402Result = await mockX402.processPayment(x402Tx);
console.log(`  x402 result: ${x402Result.success ? 'SUCCESS' : 'FAILED'} (txId: ${x402Result.txId})`);

// Test ACP payment
mockACP.addPaymentMethod({
  id: 'pm_test',
  type: 'wallet',
  active: true,
  balance: 1000,
});

const acpTx = createTransaction({
  agentId: 'test-agent' as AgentId,
  recipient: 'merchant:coffee-shop',
  amount: 5.50,
  currency: 'USD',
  purpose: 'Test ACP payment',
  protocol: 'acp',
});

const acpResult = await mockACP.processPayment(acpTx);
console.log(`  ACP result: ${acpResult.success ? 'SUCCESS' : 'FAILED'} (txId: ${acpResult.txId})`);

// Show available test scenarios
console.log(`\n  Built-in test scenarios:`);
console.log(`    - ${SCENARIO_OVERSPEND.name}: ${SCENARIO_OVERSPEND.description}`);
console.log(`    - ...and ${8} more scenarios available`);

// =============================================================================
// Summary
// =============================================================================

console.log('\n--- Summary ---\n');
console.log('  PaySentry gives you full control over AI agent payments:');
console.log('  - OBSERVE: Track every dollar, analyze patterns, alert on anomalies');
console.log('  - CONTROL: Declarative policies — budgets, approvals, allow/deny lists');
console.log('  - PROTECT: Full audit trail, dispute resolution, automated recovery');
console.log('  - TEST: Mock any protocol, run pre-built scenarios, no real money');
console.log('');
