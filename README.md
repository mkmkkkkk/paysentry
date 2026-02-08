# PaySentry

**Payment control plane for AI agents** — spending limits, circuit breakers, and audit trails for x402, MCP, and autonomous agent payments.

[![npm](https://img.shields.io/npm/v/@paysentry/core?label=%40paysentry%2Fcore)](https://www.npmjs.com/package/@paysentry/core)
[![npm](https://img.shields.io/npm/v/@paysentry/x402?label=%40paysentry%2Fx402)](https://www.npmjs.com/package/@paysentry/x402)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/mkmkkkkk/paysentry/actions/workflows/ci.yml/badge.svg)](https://github.com/mkmkkkkk/paysentry/actions/workflows/ci.yml)

> Your agent just authorized $500 to an API endpoint. Was that intentional?

---

## The Problem

AI agents are spending real money with zero governance:

- **x402 settlement failures drain wallets silently** — facilitator takes payment, service returns 500 ([coinbase/x402#1062](https://github.com/coinbase/x402/issues/1062))
- **No spending limits** — one prompt injection = unlimited spend
- **No audit trail** — "which agent spent $2,400 last Tuesday?"
- **Retry storms cause duplicate payments** — failed settlements trigger retries with no dedup ([coinbase/x402#808](https://github.com/coinbase/x402/issues/808))
- **No circuit breakers** — one flaky facilitator cascades into system-wide failures ([coinbase/x402#803](https://github.com/coinbase/x402/issues/803))

PaySentry is the missing layer between your agents and their wallets.

---

## See it in action

<p align="center">
  <img src="docs/demo-terminal.svg" alt="PaySentry Demo — AI agent payments being allowed, blocked, and rate limited in real-time" width="800" />
</p>

<details>
<summary><b>Text version</b> (if SVG doesn't render)</summary>

```
  PaySentry Demo — AI Agent Payment Controls
  ══════════════════════════════════════════════════

  Policy: Max $100/tx | Approval above $40 | Daily $500 | 5 tx/min
  Agent:  agent-research-01  |  Balance: $10000.00

  [1/5] $25.00  → api.openai.com      ✅ ALLOWED
  [2/5] $45.00  → anthropic.com       ⚠️ REQUIRES APPROVAL
  [3/5] $150.00 → sketchy-api.xyz     ❌ BLOCKED (above $100 limit)
  [4/5] $30.00  → api.openai.com      ✅ ALLOWED + 🔔 repeat recipient alert
  [5/5] 6 rapid payments              ❌ RATE LIMITED (5 tx/min)

  Summary:
    Allowed: 4  ($65.00)
    Pending: 1  ($45.00)
    Blocked: 2  ($150.00 + rate limit)
    Alerts:  4  (large tx, rate spike)
```

</details>

**Try it yourself:**

```bash
npx paysentry-demo
```

---

## Quick Start

```bash
npm install @paysentry/core @paysentry/control @paysentry/observe
```

### Add spending limits in 5 lines

```typescript
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';

const engine = new PolicyEngine();

engine.loadPolicy({
  id: 'production' as PolicyId,
  name: 'Production Controls',
  enabled: true,
  rules: [
    blockAbove(1000, 'USDC'),           // Hard block above $1000
    requireApprovalAbove(100, 'USDC'),  // Human approval above $100
    allowAll(),                         // Allow everything else
  ],
  budgets: [
    { window: 'daily', maxAmount: 500, currency: 'USDC' },
    { window: 'monthly', maxAmount: 5000, currency: 'USDC' },
  ],
});

const result = engine.evaluate(transaction);
// result.action: 'allow' | 'deny' | 'require_approval' | 'flag'
```

### x402 adapter — 3 lines to protect your x402 server

```bash
npm install @paysentry/x402
```

```typescript
import { PaySentryX402Adapter } from '@paysentry/x402';
import { PolicyEngine } from '@paysentry/control';
import { SpendTracker } from '@paysentry/observe';

const adapter = new PaySentryX402Adapter(
  { policyEngine: new PolicyEngine(), spendTracker: new SpendTracker() },
  { circuitBreaker: { failureThreshold: 5, recoveryTimeoutMs: 30_000 } },
);

// Registers all 6 lifecycle hooks: onBeforeVerify, onAfterVerify,
// onVerifyFailure, onBeforeSettle, onAfterSettle, onSettleFailure
adapter.withLifecycleHooks(yourX402Server);
```

---

## What PaySentry Does

| Problem | Solution | Package |
|---------|----------|---------|
| Agents spend without limits | Declarative spending policies, budget caps, approval chains | `@paysentry/control` |
| No visibility into agent spend | Real-time transaction tracking, analytics, anomaly detection | `@paysentry/observe` |
| x402 settlement failures lose money | Circuit breakers + retry classification per facilitator | `@paysentry/x402` |
| No audit trail for compliance | Immutable provenance chain: intent -> policy -> execution -> settlement | `@paysentry/protect` |
| Can't test without real money | Mock x402, ACP, and AP2 endpoints with pre-built failure scenarios | `@paysentry/sandbox` |

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@paysentry/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@paysentry/core)](https://www.npmjs.com/package/@paysentry/core) | Core types, utilities, and shared infrastructure |
| [`@paysentry/observe`](packages/observe) | [![npm](https://img.shields.io/npm/v/@paysentry/observe)](https://www.npmjs.com/package/@paysentry/observe) | Payment tracking, analytics, budget alerts, anomaly detection |
| [`@paysentry/control`](packages/control) | [![npm](https://img.shields.io/npm/v/@paysentry/control)](https://www.npmjs.com/package/@paysentry/control) | Policy engine — rules, budgets, approval chains, middleware |
| [`@paysentry/protect`](packages/protect) | [![npm](https://img.shields.io/npm/v/@paysentry/protect)](https://www.npmjs.com/package/@paysentry/protect) | Dispute resolution — provenance, disputes, automated recovery |
| [`@paysentry/sandbox`](packages/sandbox) | [![npm](https://img.shields.io/npm/v/@paysentry/sandbox)](https://www.npmjs.com/package/@paysentry/sandbox) | Mock payment environment — x402, ACP, AP2 with 9 test scenarios |
| [`@paysentry/x402`](packages/x402) | [![npm](https://img.shields.io/npm/v/@paysentry/x402)](https://www.npmjs.com/package/@paysentry/x402) | x402 protocol adapter — lifecycle hooks, circuit breakers |

---

## Examples

### Real-time spend tracking with alerts

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

const report = analytics.getAgentAnalytics('research-bot' as AgentId);
// report.spendByCurrency, report.topRecipients, report.anomalies
```

### Express/Fastify middleware

```typescript
import { createPolicyMiddleware } from '@paysentry/control';

app.use('/pay', createPolicyMiddleware({
  engine,
  approvalHandler: async (tx) => {
    return await slack.requestApproval(tx);
  },
}));
```

### Payment sandbox for testing

```typescript
import { MockX402, MockACP, ALL_SCENARIOS } from '@paysentry/sandbox';

const x402 = new MockX402({ latencyMs: 10, failureRate: 0.1 });
const result = await x402.processPayment(transaction);

// 9 pre-built scenarios: overspend, timeout, dispute, multi-protocol, etc.
console.log(ALL_SCENARIOS.map(s => s.name));
```

See [`examples/`](examples/) for complete runnable demos.

### Run the E2E example

The full x402 payment flow with policy enforcement, circuit breaker, spend tracking, and alerts:

```bash
npm install && npm run build
npx tsx examples/05-x402-e2e.ts
```

Output shows allow/block/alert decisions for 5 scenarios:
1. Small payment ($5) — allowed and settled
2. Medium payment ($75) — blocked by approval policy
3. Large payment ($1500) — blocked by budget
4. Multiple payments — budget threshold alert at 80%
5. Facilitator failures — circuit breaker opens

---

## Architecture

```
                    ┌─────────────────────────────────┐
                    │         Your AI Agent            │
                    └───────────────┬─────────────────┘
                                    │
                    ┌───────────────v─────────────────┐
                    │     PaySentry Control Plane      │
                    │                                  │
                    │  OBSERVE   CONTROL   PROTECT     │
                    │  tracking  policies  provenance  │
                    │  alerts    budgets   disputes    │
                    │  analytics approval  recovery    │
                    └───────┬───────┬───────┬─────────┘
                            │       │       │
                    ┌───────v──┐ ┌──v────┐ ┌v────────┐
                    │   x402   │ │  ACP  │ │   AP2   │
                    │ HTTP 402 │ │Stripe/│ │Agent-to-│
                    │ Protocol │ │Commrc │ │ Agent   │
                    └──────────┘ └───────┘ └─────────┘
```

---

## Roadmap

- [x] Core spending policies and budget enforcement
- [x] Real-time spend tracking and anomaly detection
- [x] Dispute resolution and automated recovery
- [x] Multi-protocol payment sandbox (x402, ACP, AP2)
- [x] x402 protocol adapter with circuit breakers
- [ ] MCP payment server (reference implementation)
- [ ] Dashboard UI for spend visualization
- [ ] AP2 / Visa TAP protocol adapters

---

## Development

```bash
npm install          # Install dependencies
npm run build        # Build all packages
npm run typecheck    # Type check
npm test             # Run tests
npm run lint         # Lint
```

---

## Contributing

Contributions welcome. Open an issue first for major changes.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Write tests for new functionality
4. Ensure `npm test` and `npm run typecheck` pass
5. Open a PR against `main`

---

## License

MIT
