#!/usr/bin/env npx tsx
// =============================================================================
// PaySentry x402 E2E Example — The Full Payment Flow
//
// Shows the complete x402 payment lifecycle with PaySentry controls:
//   Policy evaluation → Circuit breaker → Facilitator → Spend tracking → Alerts
//
// Run: npx tsx examples/05-x402-e2e.ts
// =============================================================================

import { createTransaction, type AgentId, type PolicyId } from '@paysentry/core';
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';
import { SpendTracker, SpendAlerts } from '@paysentry/observe';
import { TransactionProvenance } from '@paysentry/protect';
import {
  PaySentryX402Adapter,
  CircuitBreakerOpenError,
  type X402FacilitatorClient,
  type X402PaymentPayload,
  type X402PaymentRequirements,
} from '@paysentry/x402';

// ---------------------------------------------------------------------------
// 1. Set up PaySentry engines
// ---------------------------------------------------------------------------

const policyEngine = new PolicyEngine();

policyEngine.loadPolicy({
  id: 'production' as PolicyId,
  name: 'Production Controls',
  enabled: true,
  rules: [
    blockAbove(1000, 'USDC'),            // Hard block above $1000
    requireApprovalAbove(50, 'USDC'),    // Human review above $50
    allowAll(),                          // Allow everything else
  ],
  budgets: [
    { window: 'daily', maxAmount: 200, currency: 'USDC' },
  ],
});

const spendTracker = new SpendTracker();
const spendAlerts = new SpendAlerts(spendTracker);
const provenance = new TransactionProvenance();

// Alert: flag large transactions
spendAlerts.addRule({
  id: 'large-tx',
  name: 'Large Transaction Alert',
  type: 'large_transaction',
  severity: 'warning',
  enabled: true,
  config: { type: 'large_transaction', threshold: 30, currency: 'USDC' },
});

// Alert: budget at 80%
spendAlerts.addRule({
  id: 'budget-80',
  name: 'Daily Budget 80%',
  type: 'budget_threshold',
  severity: 'warning',
  enabled: true,
  config: {
    type: 'budget_threshold',
    threshold: 200,
    currency: 'USDC',
    windowMs: 86_400_000,
    alertAtPercent: 0.8,
  },
});

// Alert: new recipients
spendAlerts.addRule({
  id: 'new-recip',
  name: 'New Recipient',
  type: 'new_recipient',
  severity: 'info',
  enabled: true,
  config: { type: 'new_recipient' },
});

const alertLog: string[] = [];
spendAlerts.onAlert((alert) => {
  alertLog.push(`  [${alert.severity.toUpperCase()}] ${alert.message}`);
});

// ---------------------------------------------------------------------------
// 2. Mock x402 Facilitator
// ---------------------------------------------------------------------------

let facilitatorCallCount = 0;
let facilitatorShouldFail = false;

const mockFacilitator: X402FacilitatorClient = {
  async verify(payload, requirements) {
    facilitatorCallCount++;
    if (facilitatorShouldFail) throw new Error('Facilitator timeout');
    return { isValid: true, payer: String(payload.payer ?? 'unknown') };
  },
  async settle(payload, requirements) {
    facilitatorCallCount++;
    if (facilitatorShouldFail) throw new Error('Facilitator timeout');
    return {
      success: true,
      txHash: `0x${Math.random().toString(16).slice(2, 14)}`,
      network: requirements.network,
    };
  },
  async supported() {
    return { schemes: ['exact'], networks: ['base-sepolia'] };
  },
};

// ---------------------------------------------------------------------------
// 3. Create adapter and wrap facilitator
// ---------------------------------------------------------------------------

const adapter = new PaySentryX402Adapter(
  { policyEngine, spendTracker, spendAlerts, provenance },
  {
    defaultCurrency: 'USDC',
    circuitBreaker: { failureThreshold: 3, recoveryTimeoutMs: 500 },
    sessionId: 'demo-session',
  },
);

const wrappedFacilitator = adapter.wrapFacilitatorClient(mockFacilitator, 'demo-facilitator');

// ---------------------------------------------------------------------------
// 4. Helper: simulate a payment
// ---------------------------------------------------------------------------

function makePayload(payer: string): X402PaymentPayload {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: 'signed-payment-data',
    resource: 'https://api.example.com/ai/inference',
    payer,
  };
}

function makeRequirements(amountUSDC: number, recipient: string): X402PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'base-sepolia',
    maxAmountRequired: String(amountUSDC * 1_000_000), // USDC 6 decimals
    resource: 'https://api.example.com/ai/inference',
    payTo: recipient,
    description: `Payment of $${amountUSDC} USDC`,
  };
}

async function simulatePayment(
  label: string,
  amountUSDC: number,
  payer: string = '0xAgentWallet',
  recipient: string = '0xServiceProvider',
): Promise<void> {
  const payload = makePayload(payer);
  const requirements = makeRequirements(amountUSDC, recipient);

  process.stdout.write(`\n  ${label}: $${amountUSDC} USDC `);
  process.stdout.write(`(${payer.slice(0, 8)}... -> ${recipient.slice(0, 8)}...)\n`);

  try {
    // Step 1: Verify
    const verifyResult = await wrappedFacilitator.verify(payload, requirements);
    if (!verifyResult.isValid) {
      console.log(`    -> BLOCKED at verify: ${verifyResult.invalidReason}`);
      return;
    }

    // Step 2: Settle
    const settleResult = await wrappedFacilitator.settle(payload, requirements);
    if (settleResult.success) {
      console.log(`    -> SETTLED (tx: ${settleResult.txHash})`);
    } else {
      console.log(`    -> SETTLE FAILED`);
    }
  } catch (err) {
    if (err instanceof CircuitBreakerOpenError) {
      console.log(`    -> CIRCUIT BREAKER OPEN (${err.remainingMs}ms until recovery)`);
    } else {
      console.log(`    -> ERROR: ${(err as Error).message}`);
    }
  }

  // Print any alerts that fired
  if (alertLog.length > 0) {
    for (const a of alertLog) console.log(a);
    alertLog.length = 0;
  }
}

// ---------------------------------------------------------------------------
// 5. Run scenarios
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log('  PaySentry x402 E2E Demo');
  console.log('  Policy: Block >$1000 | Approval >$50 | Daily $200 budget');
  console.log('='.repeat(60));

  // Scenario 1: Small payment — should be allowed
  await simulatePayment('[1] Small payment', 5, '0xAgentWallet', '0xOpenAI');

  // Scenario 2: Medium payment — triggers require_approval
  await simulatePayment('[2] Medium payment', 75, '0xAgentWallet', '0xAnthropic');

  // Scenario 3: Large payment — blocked by policy
  await simulatePayment('[3] Large payment', 1500, '0xAgentWallet', '0xExpensive');

  // Scenario 4: Multiple small payments — demonstrate budget tracking
  await simulatePayment('[4a] Budget test', 40, '0xAgentWallet', '0xOpenAI');
  await simulatePayment('[4b] Budget test', 40, '0xAgentWallet', '0xOpenAI');
  await simulatePayment('[4c] Budget test', 40, '0xAgentWallet', '0xOpenAI');

  // Scenario 5: Repeated failures — circuit breaker
  console.log('\n  [5] Circuit breaker test: 3 facilitator failures...');
  facilitatorShouldFail = true;
  for (let i = 0; i < 3; i++) {
    await simulatePayment(`  [5.${i + 1}] Failing call`, 1);
  }
  // This one should be rejected by the circuit breaker
  await simulatePayment('  [5.4] After breaker trips', 1);
  facilitatorShouldFail = false;

  // ---------------------------------------------------------------------------
  // 6. Print summary
  // ---------------------------------------------------------------------------

  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));

  console.log(`\n  Transactions recorded: ${spendTracker.size}`);
  console.log(`  Unique agents: ${spendTracker.agents.length}`);
  console.log(`  Unique recipients: ${spendTracker.recipients.length}`);
  console.log(`  Facilitator calls: ${facilitatorCallCount}`);

  const provenanceIds = provenance.transactionIds;
  console.log(`  Provenance chains: ${provenanceIds.length}`);
  console.log(`  Total provenance records: ${provenance.totalRecords}`);

  if (provenanceIds.length > 0) {
    const firstId = provenanceIds[0]!;
    const chain = provenance.getChain(firstId);
    console.log(`\n  Example provenance chain (${firstId}):`);
    for (const record of chain) {
      console.log(`    ${record.stage} -> ${record.outcome}: ${record.action}`);
    }
  }

  const breaker = adapter.getCircuitBreaker();
  const snapshot = breaker.getSnapshot();
  if (snapshot.size > 0) {
    console.log('\n  Circuit breaker states:');
    for (const [key, state] of snapshot) {
      console.log(`    ${key}: ${state.state} (failures: ${state.failureCount})`);
    }
  }

  console.log(`\n  Session ID: ${adapter.getSessionId()}`);
  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
