# PaySentry

**The missing control plane for AI agent payments.**

[![Build](https://img.shields.io/github/actions/workflow/status/paysentry/paysentry/ci.yml?branch=main)](https://github.com/paysentry/paysentry/actions)
[![Test](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/paysentry/paysentry/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@paysentry/core)](https://www.npmjs.com/package/@paysentry/core)

AI agents are spending real money — API calls, compute, data purchases, subscriptions. PaySentry gives you observability, policy enforcement, dispute resolution, and a testing sandbox for every payment your agents make.

```
npm install @paysentry/core @paysentry/observe @paysentry/control @paysentry/protect @paysentry/sandbox
```

---

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              PaySentry                      │
                         │         Agent Payment Control Plane         │
                         └─────────────────────────────────────────────┘
                                            │
              ┌─────────────┬───────────────┼───────────────┬──────────────┐
              │             │               │               │              │
        ┌─────────┐  ┌───────────┐  ┌──────────────┐  ┌─────────┐  ┌──────────┐
        │ OBSERVE │  │  CONTROL  │  │   PROTECT    │  │  TEST   │  │   CORE   │
        │         │  │           │  │              │  │         │  │          │
        │ Tracker │  │  Policy   │  │ Provenance   │  │ MockX402│  │  Types   │
        │Analytics│  │  Engine   │  │ Disputes     │  │ MockACP │  │  Utils   │
        │ Alerts  │  │  Rules    │  │ Recovery     │  │ MockAP2 │  │  Factory │
        │         │  │Middleware │  │              │  │Scenarios│  │          │
        └─────────┘  └───────────┘  └──────────────┘  └─────────┘  └──────────┘
              │             │               │               │
              └─────────────┴───────────────┴───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
         ┌─────────┐          ┌─────────┐          ┌─────────┐
         │  x402   │          │   ACP   │          │   AP2   │
         │HTTP 402 │          │ Stripe/ │          │Agent-to-│
         │Protocol │          │Commerce │          │ Agent   │
         └─────────┘          └─────────┘          └─────────┘
```

---

## The 4 Pillars

### 1. Observe — Know what your agents spend

Track every transaction, break down spend by agent/service/protocol/time, and get alerts when something looks off.

```typescript
import { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';
import { createTransaction, type AgentId } from '@paysentry/core';

const tracker = new SpendTracker();
const analytics = new SpendAnalytics(tracker);
const alerts = new SpendAlerts(tracker);

// Alert when daily spend exceeds 80% of $500 budget
alerts.addRule({
  id: 'daily-budget',
  name: 'Daily USDC Budget',
  type: 'budget_threshold',
  severity: 'warning',
  enabled: true,
  config: {
    type: 'budget_threshold',
    threshold: 500,
    currency: 'USDC',
    windowMs: 86400000,
    alertAtPercent: 0.8,
  },
});

alerts.onAlert((alert) => {
  slack.send(`[${alert.severity}] ${alert.message}`);
});

// Record transactions as they happen
const tx = createTransaction({
  agentId: 'research-bot' as AgentId,
  recipient: 'https://api.openai.com/v1/chat',
  amount: 0.05,
  currency: 'USDC',
  purpose: 'GPT-4 market analysis',
  protocol: 'x402',
});
tx.status = 'completed';
tracker.record(tx);

// Get analytics
const report = analytics.getAgentAnalytics('research-bot' as AgentId);
console.log(report.spendByCurrency);   // Map { 'USDC' => { totalAmount: 0.05, ... } }
console.log(report.topRecipients);     // [{ recipient: 'api.openai.com', totalAmount: 0.05, count: 1 }]
```

**Features:**
- Per-agent, per-service, per-protocol spend tracking
- Time-series analytics (hourly/daily/weekly/monthly)
- Anomaly detection (z-score based)
- Rate spike detection
- New recipient alerts
- Budget threshold alerts

---

### 2. Control — Set the rules, enforce them

Declarative policy engine. Budget caps, rate limits, allow/deny lists, approval chains. No LLM can override these rules.

```typescript
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';
import type { PolicyId } from '@paysentry/core';

const engine = new PolicyEngine();

engine.loadPolicy({
  id: 'production' as PolicyId,
  name: 'Production Controls',
  enabled: true,
  rules: [
    blockAbove(1000, 'USDC'),              // Hard block above $1000
    requireApprovalAbove(100, 'USDC'),     // Human approval above $100
    allowAll(),                            // Allow everything else
  ],
  budgets: [
    { window: 'daily', maxAmount: 500, currency: 'USDC' },
    { window: 'monthly', maxAmount: 5000, currency: 'USDC' },
  ],
  cooldownMs: 1000,
});

const result = engine.evaluate(transaction);
// result.allowed: boolean
// result.action: 'allow' | 'deny' | 'require_approval' | 'flag'
// result.reason: 'Rule "Block transactions above 1000 USDC" matched: action=deny'
```

**Express/Fastify middleware:**

```typescript
import { createPolicyMiddleware } from '@paysentry/control';

app.use('/pay', createPolicyMiddleware({
  engine,
  approvalHandler: async (tx) => {
    const approved = await slack.requestApproval(tx);
    return approved;
  },
}));
```

**Features:**
- Declarative JSON/code policy definitions
- Per-agent, per-service, per-protocol granularity
- Time-based budgets (hourly/daily/weekly/monthly)
- Cooldown enforcement
- Approval chains (auto-approve < $X, require approval > $Y, block > $Z)
- Allow/deny lists with glob pattern matching
- HTTP middleware for any framework

---

### 3. Protect — Resolve disputes, recover funds

Full audit trail from intent to settlement. When things go wrong, you have the evidence to file disputes and automate recovery.

```typescript
import { TransactionProvenance, DisputeManager, RecoveryEngine } from '@paysentry/protect';

const provenance = new TransactionProvenance();
const disputes = new DisputeManager({ provenance });

// Provenance records every step automatically
provenance.recordIntent(tx, { originalPrompt: 'Buy market data' });
provenance.recordPolicyCheck(tx.id, 'pass', { policyId: 'production' });
provenance.recordExecution(tx.id, 'pass', { txHash: '0xabc...' });
provenance.recordSettlement(tx.id, 'fail', { error: 'Service returned 500' });

// File a dispute — provenance is automatically attached as evidence
const dispute = disputes.file({
  transactionId: tx.id,
  agentId: tx.agentId,
  reason: 'Service failed to deliver after payment',
  requestedAmount: tx.amount,
});

// Resolve and recover
disputes.resolve(dispute.id, {
  status: 'resolved_refunded',
  liability: 'service_provider',
  resolvedAmount: tx.amount,
});

const recovery = new RecoveryEngine({
  disputes,
  executor: async (action) => {
    const result = await protocol.refund(action.transactionId, action.amount);
    return { success: result.ok, refundTxId: result.id };
  },
});

recovery.initiate(dispute.id);
await recovery.processQueue();
```

**Features:**
- Immutable provenance chain (intent -> policy -> approval -> execution -> settlement)
- Dispute lifecycle management (open -> investigating -> resolved)
- Liability attribution (agent / service_provider / protocol / user)
- Automated refund/chargeback flows with retry logic
- Evidence collection and attachment
- Status change webhooks

---

### 4. Test — Mock every protocol

Payment sandbox with mock x402, ACP, and AP2 endpoints. Test your agent payment logic without spending real money.

```typescript
import { MockX402, MockACP, MockAP2, ALL_SCENARIOS } from '@paysentry/sandbox';

// Mock x402 (HTTP 402 Payment Required)
const x402 = new MockX402({ latencyMs: 10, failureRate: 0.1 });
const result = await x402.processPayment(transaction);

// Mock ACP (Agent Commerce Protocol / Stripe-like)
const acp = new MockACP({ declinedMerchants: ['merchant:blocked'] });
acp.addPaymentMethod({ id: 'pm_1', type: 'wallet', active: true, balance: 1000 });

// Mock AP2 (Agent-to-Agent with mandates)
const ap2 = new MockAP2();
ap2.createMandate({
  grantor: 'agent-1' as AgentId,
  grantee: 'agent-2' as AgentId,
  maxPerTransaction: 10,
  maxCumulative: 100,
  currency: 'USDC',
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
});

// Pre-built test scenarios
console.log(ALL_SCENARIOS.map(s => s.name));
// ['Basic Payment', 'Budget Overspend', 'Approval Required',
//  'Blocked Recipient', 'Multi-Protocol', 'Dispute Flow',
//  'Rate Spike', 'Timeout', 'Multi-Agent']
```

**Features:**
- Mock x402 facilitator with configurable latency/failure rate
- Mock ACP endpoint with payment methods and declined merchant lists
- Mock AP2 mandate issuer with cumulative spend tracking
- 9 pre-built test scenarios (overspend, timeout, dispute, multi-protocol, etc.)
- Full control over simulated behavior

---

## Packages

| Package | Description |
|---------|-------------|
| [`@paysentry/core`](packages/core) | Core types, utilities, and shared infrastructure |
| [`@paysentry/observe`](packages/observe) | Payment observability — tracking, analytics, alerts |
| [`@paysentry/control`](packages/control) | Policy engine — rules, budgets, middleware |
| [`@paysentry/protect`](packages/protect) | Dispute resolution — provenance, disputes, recovery |
| [`@paysentry/sandbox`](packages/sandbox) | Payment testing — mock protocols, test scenarios |

---

## Quick Start

```bash
# Install
npm install @paysentry/core @paysentry/observe @paysentry/control

# Or install everything
npm install @paysentry/core @paysentry/observe @paysentry/control @paysentry/protect @paysentry/sandbox
```

See [`examples/quickstart.ts`](examples/quickstart.ts) for a complete demo showing all 4 pillars working together.

---

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Type check
npm run typecheck

# Run tests
npm test

# Lint
npm run lint
```

---

## Why PaySentry?

AI agents are increasingly autonomous — they browse the web, call APIs, purchase compute, and transact with other agents. But today, there is no standard way to:

- **See** what your agents are spending (Observe)
- **Limit** what they can spend (Control)
- **Recover** when a payment goes wrong (Protect)
- **Test** payment logic without real money (Test)

PaySentry fills this gap. It works with any payment protocol (x402, ACP, AP2, Stripe) and any agent framework. Drop it into your stack and get full control over agent payments from day one.

---

## License

MIT
