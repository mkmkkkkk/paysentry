// =============================================================================
// 02-control.ts — Policy Engine
//
// Demonstrates the Control pillar: PolicyEngine, rule builders, budgets
// Declarative policies — budgets, approvals, allow/deny lists.
//
// Run: npx tsx examples/02-control.ts
// =============================================================================

import type { AgentId, PolicyId, ServiceId } from '@paysentry/core';
import { createTransaction } from '@paysentry/core';
import {
  PolicyEngine,
  blockAbove,
  requireApprovalAbove,
  blockRecipient,
  allowOnlyRecipients,
  allowAll,
  denyAll,
  RuleBuilder,
} from '@paysentry/control';

// =============================================================================
// 1. Basic Policy — Pre-built rules
// =============================================================================

console.log('=== Basic Policy with Pre-built Rules ===\n');

const engine = new PolicyEngine();

engine.loadPolicy({
  id: 'production' as PolicyId,
  name: 'Production Policy',
  description: 'Standard controls for production agents',
  enabled: true,
  rules: [
    blockRecipient('https://malicious-*.com/*'),   // Priority 5:  block bad actors
    blockAbove(1000, 'USDC'),                      // Priority 10: hard cap
    requireApprovalAbove(100, 'USDC'),             // Priority 20: human-in-the-loop
    allowAll(),                                    // Priority 9999: catch-all allow
  ],
  budgets: [
    { window: 'daily', maxAmount: 500, currency: 'USDC' },
    { window: 'monthly', maxAmount: 5000, currency: 'USDC' },
  ],
  cooldownMs: 1000, // 1 second between transactions
});

// --- Test 1: Small transaction (should be ALLOWED) ---
const smallTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 5.0,
  currency: 'USDC',
  purpose: 'Standard API call',
  protocol: 'x402',
});

const smallResult = engine.evaluate(smallTx);
console.log(`$5 payment:    ${smallResult.action} — ${smallResult.reason}`);

// --- Test 2: Medium transaction (should REQUIRE APPROVAL) ---
const mediumTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://compute.example.com/train',
  amount: 250.0,
  currency: 'USDC',
  purpose: 'Model training run',
  protocol: 'x402',
});

const mediumResult = engine.evaluate(mediumTx);
console.log(`$250 payment:  ${mediumResult.action} — ${mediumResult.reason}`);

// --- Test 3: Huge transaction (should be DENIED) ---
const hugeTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://premium.example.com/dataset',
  amount: 2000.0,
  currency: 'USDC',
  purpose: 'Premium dataset purchase',
  protocol: 'x402',
});

const hugeResult = engine.evaluate(hugeTx);
console.log(`$2000 payment: ${hugeResult.action} — ${hugeResult.reason}`);

// --- Test 4: Blocked recipient (should be DENIED) ---
const blockedTx = createTransaction({
  agentId: 'research-agent' as AgentId,
  recipient: 'https://malicious-service.com/api',
  amount: 1.0,
  currency: 'USDC',
  purpose: 'Attempting to pay blocked recipient',
  protocol: 'x402',
});

const blockedResult = engine.evaluate(blockedTx);
console.log(`Blocked recipient: ${blockedResult.action} — ${blockedResult.reason}`);

// =============================================================================
// 2. Budget Enforcement
// =============================================================================

console.log('\n=== Budget Enforcement ===\n');

// Record several transactions to consume budget
const budgetEngine = new PolicyEngine();

budgetEngine.loadPolicy({
  id: 'budget-test' as PolicyId,
  name: 'Budget Test Policy',
  enabled: true,
  rules: [allowAll()],
  budgets: [
    { window: 'daily', maxAmount: 100, currency: 'USDC' },
  ],
});

// Spend $40 three times ($120 total, exceeds $100 daily budget)
for (let i = 1; i <= 3; i++) {
  const tx = createTransaction({
    agentId: 'spender-agent' as AgentId,
    recipient: 'https://api.example.com/resource',
    amount: 40.0,
    currency: 'USDC',
    purpose: `Purchase batch ${i}`,
    protocol: 'x402',
  });

  const result = budgetEngine.evaluate(tx);
  console.log(`Batch ${i} ($40): ${result.action} — ${result.reason}`);

  // Only record if allowed (simulates real workflow)
  if (result.allowed) {
    budgetEngine.recordTransaction(tx);
  }
}

// =============================================================================
// 3. Custom Rules with RuleBuilder
// =============================================================================

console.log('\n=== Custom Rules with RuleBuilder ===\n');

const customEngine = new PolicyEngine();

// Build custom rules using the fluent API
const onlyOpenAI = RuleBuilder.create('only-openai')
  .name('Allow only OpenAI')
  .recipients('https://api.openai.com/*')
  .action('allow')
  .priority(10)
  .build();

const flagNonStandard = RuleBuilder.create('flag-non-standard')
  .name('Flag non-standard protocols')
  .protocols('custom')
  .action('flag')
  .priority(20)
  .build();

customEngine.loadPolicy({
  id: 'custom-policy' as PolicyId,
  name: 'Custom Policy',
  enabled: true,
  rules: [onlyOpenAI, flagNonStandard, denyAll()],
  budgets: [],
});

// Test against the custom rules
const openaiTx = createTransaction({
  agentId: 'agent-1' as AgentId,
  recipient: 'https://api.openai.com/v1/embeddings',
  amount: 0.01,
  currency: 'USDC',
  purpose: 'Generate embeddings',
  protocol: 'x402',
});
console.log(`OpenAI endpoint:  ${customEngine.evaluate(openaiTx).action}`);

const otherTx = createTransaction({
  agentId: 'agent-1' as AgentId,
  recipient: 'https://api.other-service.com/data',
  amount: 0.01,
  currency: 'USDC',
  purpose: 'Fetch data from unknown service',
  protocol: 'x402',
});
console.log(`Other endpoint:   ${customEngine.evaluate(otherTx).action}`);

const customProtoTx = createTransaction({
  agentId: 'agent-1' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 0.01,
  currency: 'USDC',
  purpose: 'Custom protocol test',
  protocol: 'custom',
});
console.log(`Custom protocol:  ${customEngine.evaluate(customProtoTx).action}`);

// =============================================================================
// 4. Allowlist Policy — Only approved recipients
// =============================================================================

console.log('\n=== Allowlist Policy ===\n');

const allowlistEngine = new PolicyEngine();

allowlistEngine.loadPolicy({
  id: 'allowlist' as PolicyId,
  name: 'Allowlist Policy',
  enabled: true,
  rules: [
    allowOnlyRecipients(
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://api.cohere.com/*'
    ),
    denyAll(), // Everything not in the allowlist is denied
  ],
  budgets: [],
});

const approvedTx = createTransaction({
  agentId: 'agent-1' as AgentId,
  recipient: 'https://api.anthropic.com/v1/messages',
  amount: 0.05,
  currency: 'USDC',
  purpose: 'Call Claude API',
  protocol: 'x402',
});
console.log(`Anthropic (approved):   ${allowlistEngine.evaluate(approvedTx).action}`);

const unapprovedTx = createTransaction({
  agentId: 'agent-1' as AgentId,
  recipient: 'https://api.random-llm.com/v1/generate',
  amount: 0.05,
  currency: 'USDC',
  purpose: 'Call unknown LLM',
  protocol: 'x402',
});
console.log(`Random LLM (denied):    ${allowlistEngine.evaluate(unapprovedTx).action}`);
