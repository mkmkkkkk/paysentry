// =============================================================================
// 03-sandbox.ts — Payment Sandbox
//
// Demonstrates the Sandbox pillar: MockX402, MockACP, MockAP2
// Mock any protocol, test payment flows, no real money.
//
// Run: npx tsx examples/03-sandbox.ts
// =============================================================================

import type { AgentId } from '@paysentry/core';
import { createTransaction } from '@paysentry/core';
import {
  MockX402,
  MockACP,
  MockAP2,
  ALL_SCENARIOS,
  SCENARIO_BASIC_PAYMENT,
} from '@paysentry/sandbox';

// =============================================================================
// 1. MockX402 — HTTP 402 Payment Required protocol
// =============================================================================

console.log('=== MockX402: HTTP 402 Protocol ===\n');

const x402 = new MockX402({ latencyMs: 10 });

// Successful payment
const successTx = createTransaction({
  agentId: 'test-agent' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 0.05,
  currency: 'USDC',
  purpose: 'API call via x402',
  protocol: 'x402',
});

const successResult = await x402.processPayment(successTx);
console.log(`Normal payment:     ${successResult.success ? 'SUCCESS' : 'FAILED'} (txId: ${successResult.txId})`);

// Invalid currency
const badCurrencyTx = createTransaction({
  agentId: 'test-agent' as AgentId,
  recipient: 'https://api.example.com/data',
  amount: 1.0,
  currency: 'DOGE',
  purpose: 'Pay with unsupported currency',
  protocol: 'x402',
});

const badCurrencyResult = await x402.processPayment(badCurrencyTx);
console.log(`Unsupported currency: ${badCurrencyResult.success ? 'SUCCESS' : 'FAILED'} — ${badCurrencyResult.error}`);

// Non-HTTP recipient (x402 requires HTTP URLs)
const badRecipientTx = createTransaction({
  agentId: 'test-agent' as AgentId,
  recipient: 'agent://some-agent',
  amount: 1.0,
  currency: 'USDC',
  purpose: 'Non-HTTP recipient',
  protocol: 'x402',
});

const badRecipientResult = await x402.processPayment(badRecipientTx);
console.log(`Non-HTTP recipient:   ${badRecipientResult.success ? 'SUCCESS' : 'FAILED'} — ${badRecipientResult.error}`);

// Max amount enforcement
const cappedX402 = new MockX402({ latencyMs: 10, maxAmount: 10.0 });

const overLimitTx = createTransaction({
  agentId: 'test-agent' as AgentId,
  recipient: 'https://api.example.com/data',
  amount: 50.0,
  currency: 'USDC',
  purpose: 'Exceeds max amount',
  protocol: 'x402',
});

const overLimitResult = await cappedX402.processPayment(overLimitTx);
console.log(`Over max amount:      ${overLimitResult.success ? 'SUCCESS' : 'FAILED'} — ${overLimitResult.error}`);

console.log(`\nMock balance: $${x402.getBalance()} USDC`);
console.log(`Total payments processed: ${x402.processedPayments.length}`);

// =============================================================================
// 2. MockACP — Agent Commerce Protocol
// =============================================================================

console.log('\n=== MockACP: Agent Commerce Protocol ===\n');

const acp = new MockACP({
  latencyMs: 10,
  declinedMerchants: ['merchant:scam-shop'],
});

// Add a wallet with $500 balance
acp.addPaymentMethod({
  id: 'pm_wallet',
  type: 'wallet',
  active: true,
  balance: 500,
});

// Successful merchant payment
const merchantTx = createTransaction({
  agentId: 'shopping-agent' as AgentId,
  recipient: 'merchant:coffee-shop',
  amount: 4.50,
  currency: 'USD',
  purpose: 'Buy coffee',
  protocol: 'acp',
});

const merchantResult = await acp.processPayment(merchantTx);
console.log(`Normal payment:      ${merchantResult.success ? 'SUCCESS' : 'FAILED'} (txId: ${merchantResult.txId})`);

// Declined merchant
const scamTx = createTransaction({
  agentId: 'shopping-agent' as AgentId,
  recipient: 'merchant:scam-shop',
  amount: 10.0,
  currency: 'USD',
  purpose: 'Attempt to pay declined merchant',
  protocol: 'acp',
});

const scamResult = await acp.processPayment(scamTx);
console.log(`Declined merchant:   ${scamResult.success ? 'SUCCESS' : 'FAILED'} — ${scamResult.error}`);

// Insufficient balance
const expensiveTx = createTransaction({
  agentId: 'shopping-agent' as AgentId,
  recipient: 'merchant:luxury-store',
  amount: 999.0,
  currency: 'USD',
  purpose: 'Exceeds wallet balance',
  protocol: 'acp',
});

const expensiveResult = await acp.processPayment(expensiveTx);
console.log(`Insufficient funds:  ${expensiveResult.success ? 'SUCCESS' : 'FAILED'} — ${expensiveResult.error}`);

console.log(`\nTransaction log entries: ${acp.transactionLog.length}`);

// =============================================================================
// 3. MockAP2 — Agent-to-Agent Payment Protocol
// =============================================================================

console.log('\n=== MockAP2: Agent-to-Agent Protocol ===\n');

const ap2 = new MockAP2({ latencyMs: 10 });

// Create a mandate: agent-alpha authorizes agent-beta to spend up to $50
const mandate = ap2.createMandate({
  grantor: 'agent-alpha' as AgentId,
  grantee: 'agent-beta' as AgentId,
  maxPerTransaction: 20,
  maxCumulative: 50,
  currency: 'USDC',
  expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24h from now
});

console.log(`Mandate created: ${mandate.id}`);
console.log(`  ${mandate.grantor} -> ${mandate.grantee}`);
console.log(`  Max per tx: $${mandate.maxPerTransaction}, Cumulative: $${mandate.maxCumulative}`);

// Successful payment under mandate
const a2aTx = createTransaction({
  agentId: 'agent-beta' as AgentId,
  recipient: 'agent://agent-alpha',
  amount: 15.0,
  currency: 'USDC',
  purpose: 'Data processing fee',
  protocol: 'ap2',
});

const a2aResult = await ap2.processPayment(a2aTx, mandate.id);
console.log(`\n$15 under mandate:   ${a2aResult.success ? 'SUCCESS' : 'FAILED'} (txId: ${a2aResult.txId})`);

// Exceeds per-transaction limit
const tooMuchTx = createTransaction({
  agentId: 'agent-beta' as AgentId,
  recipient: 'agent://agent-alpha',
  amount: 25.0,
  currency: 'USDC',
  purpose: 'Exceeds per-tx limit',
  protocol: 'ap2',
});

const tooMuchResult = await ap2.processPayment(tooMuchTx, mandate.id);
console.log(`$25 (over per-tx):   ${tooMuchResult.success ? 'SUCCESS' : 'FAILED'} — ${tooMuchResult.error}`);

// Check mandate state after payments
const updatedMandate = ap2.getMandate(mandate.id)!;
console.log(`\nMandate spent: $${updatedMandate.spent} / $${updatedMandate.maxCumulative}`);

// Revoke the mandate
ap2.revokeMandate(mandate.id);
console.log(`Mandate revoked: ${ap2.getMandate(mandate.id)?.active === false ? 'yes' : 'no'}`);

// Payment after revocation should fail
const afterRevokeTx = createTransaction({
  agentId: 'agent-beta' as AgentId,
  recipient: 'agent://agent-alpha',
  amount: 5.0,
  currency: 'USDC',
  purpose: 'Payment after revoke',
  protocol: 'ap2',
});

const afterRevokeResult = await ap2.processPayment(afterRevokeTx, mandate.id);
console.log(`After revoke:        ${afterRevokeResult.success ? 'SUCCESS' : 'FAILED'} — ${afterRevokeResult.error}`);

// =============================================================================
// 4. Failure Rate Simulation
// =============================================================================

console.log('\n=== Failure Rate Simulation ===\n');

const unreliable = new MockX402({ latencyMs: 5, failureRate: 0.5 });

let successes = 0;
let failures = 0;
const trials = 20;

for (let i = 0; i < trials; i++) {
  const tx = createTransaction({
    agentId: 'test-agent' as AgentId,
    recipient: 'https://api.flaky-service.com/data',
    amount: 0.01,
    currency: 'USDC',
    purpose: `Reliability test ${i + 1}`,
    protocol: 'x402',
  });

  const result = await unreliable.processPayment(tx);
  if (result.success) successes++;
  else failures++;
}

console.log(`${trials} payments with 50% failure rate:`);
console.log(`  Successes: ${successes}`);
console.log(`  Failures:  ${failures}`);

// =============================================================================
// 5. Pre-built Test Scenarios
// =============================================================================

console.log('\n=== Available Test Scenarios ===\n');

for (const scenario of ALL_SCENARIOS) {
  console.log(`- ${scenario.name}: ${scenario.description}`);
  console.log(`  Transactions: ${scenario.transactions.length}, Expected: [${scenario.expectedOutcomes.join(', ')}]`);
}
