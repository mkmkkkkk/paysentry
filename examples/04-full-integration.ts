// =============================================================================
// 04-full-integration.ts — Full Integration Example
//
// Combines all pillars: Observe + Control + Protect + Sandbox
// A realistic agent payment workflow from intent to dispute resolution.
//
// Run: npx tsx examples/04-full-integration.ts
// =============================================================================

import type { AgentId, PolicyId, ServiceId } from '@paysentry/core';
import { createTransaction } from '@paysentry/core';

// Observe
import { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';

// Control
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';

// Protect
import { TransactionProvenance, DisputeManager, RecoveryEngine } from '@paysentry/protect';

// Sandbox
import { MockX402 } from '@paysentry/sandbox';

// =============================================================================
// Setup: Wire all pillars together
// =============================================================================

console.log('=== PaySentry Full Integration ===\n');
console.log('Setting up all pillars...\n');

// Observe
const tracker = new SpendTracker();
const analytics = new SpendAnalytics(tracker);
const alerts = new SpendAlerts(tracker);

// Control
const policyEngine = new PolicyEngine();

// Protect
const provenance = new TransactionProvenance();
const disputes = new DisputeManager({ provenance });
const recovery = new RecoveryEngine({
  disputes,
  executor: async (action) => {
    console.log(`  [Recovery] Executing refund of $${action.amount} ${action.currency}...`);
    return { success: true, refundTxId: `refund_${Date.now().toString(16)}` };
  },
  maxRetries: 1,
  retryDelayMs: 100,
});

// Sandbox
const mockPayment = new MockX402({ latencyMs: 10 });

// =============================================================================
// Configure: Policies and alerts
// =============================================================================

policyEngine.loadPolicy({
  id: 'default' as PolicyId,
  name: 'Default Agent Policy',
  enabled: true,
  rules: [
    blockAbove(500, 'USDC'),
    requireApprovalAbove(50, 'USDC'),
    allowAll(),
  ],
  budgets: [
    { window: 'daily', maxAmount: 200, currency: 'USDC' },
  ],
});

alerts.addRule({
  id: 'large-tx',
  name: 'Large Transaction',
  type: 'large_transaction',
  severity: 'warning',
  enabled: true,
  config: {
    type: 'large_transaction',
    threshold: 20,
    currency: 'USDC',
  },
});

alerts.onAlert((alert) => {
  console.log(`  [ALERT] ${alert.severity}: ${alert.message}`);
});

// =============================================================================
// Workflow 1: Successful small payment (end-to-end)
// =============================================================================

console.log('--- Workflow 1: Small Payment (happy path) ---\n');

const tx1 = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 0.05,
  currency: 'USDC',
  purpose: 'GPT-4 API call for market research',
  protocol: 'x402',
  service: 'openai' as ServiceId,
});

// Step 1: Record intent (Protect)
provenance.recordIntent(tx1);
console.log('1. Intent recorded');

// Step 2: Policy check (Control)
const eval1 = policyEngine.evaluate(tx1);
provenance.recordPolicyCheck(tx1.id, eval1.allowed ? 'pass' : 'fail', {
  action: eval1.action,
  rule: eval1.triggeredRule?.name,
});
console.log(`2. Policy check: ${eval1.action} — ${eval1.reason}`);

if (eval1.allowed) {
  // Step 3: Check alerts (Observe)
  await alerts.evaluate(tx1);

  // Step 4: Execute payment (Sandbox)
  const payResult = await mockPayment.processPayment(tx1);
  provenance.recordExecution(tx1.id, payResult.success ? 'pass' : 'fail', {
    txId: payResult.txId,
  });
  console.log(`3. Payment executed: ${payResult.success ? 'SUCCESS' : 'FAILED'} (${payResult.txId})`);

  // Step 5: Record settlement
  tx1.status = 'completed';
  provenance.recordSettlement(tx1.id, 'pass', { confirmedAt: new Date().toISOString() });

  // Step 6: Track the transaction (Observe + Control)
  tracker.record(tx1);
  policyEngine.recordTransaction(tx1);
  console.log('4. Transaction recorded and settled');
}

// =============================================================================
// Workflow 2: Large payment requiring approval
// =============================================================================

console.log('\n--- Workflow 2: Large Payment (requires approval) ---\n');

const tx2 = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://compute.example.com/train',
  amount: 75.0,
  currency: 'USDC',
  purpose: 'Model training compute credits',
  protocol: 'x402',
  service: 'compute' as ServiceId,
});

provenance.recordIntent(tx2);
console.log('1. Intent recorded');

const eval2 = policyEngine.evaluate(tx2);
provenance.recordPolicyCheck(tx2.id, eval2.allowed ? 'pass' : 'fail', {
  action: eval2.action,
  rule: eval2.triggeredRule?.name,
});
console.log(`2. Policy check: ${eval2.action} — ${eval2.reason}`);

// Simulate human approval
if (eval2.action === 'require_approval') {
  const approved = true; // In production: Slack notification, email, webhook, etc.
  provenance.recordApproval(tx2.id, approved ? 'pass' : 'fail', {
    approver: 'admin@company.com',
    method: 'manual',
  });
  console.log(`3. Approval: ${approved ? 'APPROVED' : 'REJECTED'}`);

  if (approved) {
    await alerts.evaluate(tx2);
    const payResult2 = await mockPayment.processPayment(tx2);
    provenance.recordExecution(tx2.id, payResult2.success ? 'pass' : 'fail', {
      txId: payResult2.txId,
    });
    tx2.status = 'completed';
    provenance.recordSettlement(tx2.id, 'pass', {});
    tracker.record(tx2);
    policyEngine.recordTransaction(tx2);
    console.log(`4. Payment executed and settled (${payResult2.txId})`);
  }
}

// =============================================================================
// Workflow 3: Blocked payment
// =============================================================================

console.log('\n--- Workflow 3: Blocked Payment ---\n');

const tx3 = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://premium.example.com/dataset',
  amount: 1500.0,
  currency: 'USDC',
  purpose: 'Premium dataset purchase',
  protocol: 'x402',
});

provenance.recordIntent(tx3);
console.log('1. Intent recorded');

const eval3 = policyEngine.evaluate(tx3);
provenance.recordPolicyCheck(tx3.id, eval3.allowed ? 'pass' : 'fail', {
  action: eval3.action,
  rule: eval3.triggeredRule?.name,
});
console.log(`2. Policy check: ${eval3.action} — ${eval3.reason}`);
console.log('3. Payment blocked. No execution.');

tx3.status = 'rejected';
tracker.record(tx3);

// =============================================================================
// Workflow 4: Failed delivery -> Dispute -> Recovery
// =============================================================================

console.log('\n--- Workflow 4: Dispute & Recovery ---\n');

const tx4 = createTransaction({
  agentId: 'shopping-agent' as AgentId,
  recipient: 'https://flaky-data-provider.com/api',
  amount: 25.0,
  currency: 'USDC',
  purpose: 'Purchase premium dataset',
  protocol: 'x402',
});

// Happy path up to settlement
provenance.recordIntent(tx4);
const eval4 = policyEngine.evaluate(tx4);
provenance.recordPolicyCheck(tx4.id, eval4.allowed ? 'pass' : 'fail');

const payResult4 = await mockPayment.processPayment(tx4);
provenance.recordExecution(tx4.id, payResult4.success ? 'pass' : 'fail', {
  txId: payResult4.txId,
});
console.log(`1. Payment executed: ${payResult4.txId}`);

// Settlement FAILS — service returned 500 after payment
provenance.recordSettlement(tx4.id, 'fail', {
  reason: 'Service returned HTTP 500 after payment confirmed',
  httpStatus: 500,
});
tx4.status = 'failed';
tracker.record(tx4);
console.log('2. Settlement failed: service returned 500');

// File a dispute
const dispute = disputes.file({
  transactionId: tx4.id,
  agentId: tx4.agentId,
  reason: 'Service did not deliver dataset after payment was confirmed',
  requestedAmount: tx4.amount,
});
console.log(`3. Dispute filed: ${dispute.id} (status: ${dispute.status})`);
console.log(`   Evidence records: ${dispute.evidence.length}`);

// Investigate
disputes.updateStatus(dispute.id, 'investigating');
console.log(`4. Status updated: ${disputes.get(dispute.id)?.status}`);

// Add manual evidence
disputes.addEvidence(dispute.id, {
  type: 'system_log',
  description: 'HTTP response log from the service',
  data: { status: 500, body: 'Internal Server Error', timestamp: new Date().toISOString() },
  addedAt: new Date().toISOString(),
});
console.log(`5. Evidence added (total: ${disputes.get(dispute.id)?.evidence.length})`);

// Resolve in favor of the agent
const resolved = disputes.resolve(dispute.id, {
  status: 'resolved_refunded',
  liability: 'service_provider',
  resolvedAmount: tx4.amount,
});
console.log(`6. Dispute resolved: ${resolved.status}, liability: ${resolved.liability}`);

// Initiate recovery
const recoveryAction = recovery.initiate(dispute.id);
console.log(`7. Recovery initiated: ${recoveryAction.id} ($${recoveryAction.amount})`);

const processedActions = await recovery.processQueue();
console.log(`8. Recovery completed: ${processedActions[0]?.status} (refundTxId: ${processedActions[0]?.refundTxId})`);

// =============================================================================
// Final Report: Cross-pillar analytics
// =============================================================================

console.log('\n--- Final Report ---\n');

// Observe: spending summary
const agentReport = analytics.getAgentAnalytics('research-agent' as AgentId);
const usdcSpend = agentReport.spendByCurrency.get('USDC');
console.log('Observe:');
console.log(`  research-agent USDC spend: $${usdcSpend?.totalAmount ?? 0}`);
console.log(`  Total transactions tracked: ${tracker.size}`);

// Control: policies
console.log('\nControl:');
console.log(`  Policies loaded: ${policyEngine.getPolicies().length}`);
console.log(`  Budget check: daily $200 USDC`);

// Protect: provenance + disputes
console.log('\nProtect:');
console.log(`  Provenance chains: ${provenance.transactionIds.length}`);
console.log(`  Total provenance records: ${provenance.totalRecords}`);

const disputeStats = disputes.getStats();
console.log(`  Disputes: ${disputeStats.total} (resolved: ${disputeStats.resolved})`);
console.log(`  Recovered: $${recovery.getStats().totalRecovered}`);

// Provenance chain for the disputed transaction
console.log('\nFull provenance chain for disputed transaction:');
const chain = provenance.getChain(tx4.id);
for (const record of chain) {
  console.log(`  ${record.stage}: ${record.outcome} — ${record.action}`);
}
