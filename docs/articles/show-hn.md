# Show HN: PaySentry — Open-source control plane for AI agent payments

Last month, one of our AI agents silently burned through $2,400 in x402 microtransactions before anyone noticed. The agent hit a payment timeout race condition — the exact bug documented in coinbase/x402 issue #1062 — where the HTTP 402 handshake retried after a network hiccup, and the payment went through twice. Except it didn't just happen once. It happened 38 times over a weekend.

I went looking for a "Stripe test mode" equivalent for agent payments. Something that would let me set spending limits, simulate payment flows, and catch runaway transactions before they hit real wallets. It doesn't exist. x402 has crossed $600M in annualized volume with 15M+ transactions, and yet the tooling around it is still duct tape and prayer. There are 125+ open issues on the coinbase/x402 repo — timeout bugs, lost payment confirmations, silent failures — and no middleware layer to protect against any of them.

So I built PaySentry. It's an open-source control plane that sits between your AI agents and whatever payment protocol they use — x402, ACP, AP2, Visa TAP. It gives you per-agent spending limits, real-time transaction observability, a policy engine for approval flows, and a sandbox mode so you can actually test payment integrations without burning real money.

## The Problem I Faced

That $2,400 weekend incident was a wake-up call. The agent was doing exactly what it was designed to do — calling the OpenAI API via x402 payments. But when the network hiccupped mid-handshake, the payment library retried. The retry arrived after the timeout had expired, so both the original and the retry went through. This happened 38 times before our billing alert threshold triggered.

The real problem? I had no visibility. No spending dashboard. No transaction log. No way to know what happened until the damage was done. x402 is a protocol, not a governance layer. It moves money efficiently, but it doesn't tell you when things go wrong.

I realized nobody is watching the agents' wallets. We're giving them API keys to payment protocols and hoping they behave. That's not a security model. That's a liability.

## What Exists Today

We're in the middle of an agent payment explosion. x402 processes over $600M in annualized volume with 15M+ transactions. Agent Commerce Protocol (ACP) is gaining traction for agent-to-agent payments. AP2 is positioning itself as the "next-gen" alternative. Visa TAP is bridging traditional card rails to agentic workflows.

These are all protocols — they define how money moves. But none of them solve the governance problem:

- Who approved this payment?
- What policy allowed it?
- Is this agent about to blow through its monthly budget?
- Why did this payment fail?

The Model Context Protocol (MCP) gives agents the ability to call external tools, but it has no native payment abstraction. When your agent decides to pay for a service, it's operating without guardrails.

Only 1 in 5 enterprises have any form of AI agent governance in place, according to Deloitte's 2026 AI governance survey. The EU AI Act enforcement starts this year, requiring audit trails for autonomous financial decisions. We're not ready.

## What PaySentry Does

PaySentry is a control plane, not a data plane. It doesn't touch the money. It controls the flow.

It has three core capabilities:

**Observe:** Every transaction gets recorded, indexed, and analyzed. Real-time dashboards show spending by agent, by service, by protocol. Anomaly detection flags unusual patterns — rapid payment bursts, off-hours transactions, unexpected recipients. Full audit trail for compliance.

**Control:** Declarative policies defined in code. Per-agent spending limits (daily, weekly, monthly). Velocity checks ("no more than 3 payments in 60 seconds"). Human-in-the-loop approval for transactions above a threshold. Allowlist/blocklist for payment recipients. All policy changes are versioned in git.

**Protect:** Circuit breakers that automatically shut down agents when anomalies are detected. Dispute resolution for failed transactions. Sandbox mode for testing payment integrations without financial risk. Transaction context verification to detect prompt injection attacks.

## How It Works

Here's what it looks like in code. Install the packages:

```bash
npm install @paysentry/core @paysentry/observe @paysentry/control
```

Set up a policy:

```typescript
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';

const engine = new PolicyEngine();

engine.loadPolicy({
  id: 'production',
  name: 'Production Policy',
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
```

Track transactions as they happen:

```typescript
import { SpendTracker, SpendAlerts } from '@paysentry/observe';

const tracker = new SpendTracker();
const alerts = new SpendAlerts(tracker);

alerts.addRule({
  id: 'daily-budget-alert',
  type: 'budget_threshold',
  severity: 'warning',
  config: {
    threshold: 100,
    currency: 'USDC',
    windowMs: 86400000, // 24 hours
    alertAtPercent: 0.8,
  },
});

alerts.onAlert((alert) => {
  console.log(`[ALERT] ${alert.severity}: ${alert.message}`);
});
```

Evaluate a payment before it executes:

```typescript
const result = engine.evaluate(transaction);

if (!result.allowed) {
  console.log(`Blocked: ${result.reason}`);
  // Don't execute the payment
}
```

The policy engine is deterministic. No LLM, no AI, no probabilistic reasoning. If the policy says no, it's no.

## Sandbox Mode

The biggest gap I found was testing. There's no "Stripe test mode" for agent payments. You can't test x402 flows without hitting real endpoints and spending real money.

PaySentry includes sandbox mode with mock implementations of x402, ACP, and AP2:

```typescript
import { MockX402, SCENARIO_OVERSPEND } from '@paysentry/sandbox';

const mockX402 = new MockX402({ latencyMs: 10 });

// Test a payment without spending real money
const result = await mockX402.processPayment(transaction);
console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
```

Pre-built test scenarios cover common patterns: budget overspend, approval flows, blocked recipients, multi-protocol agents, dispute resolution.

## What's Next

This is an early release. The core pillars (Observe, Control, Protect, Test) are working, but there's a lot more to build:

- x402 adapter is stable; ACP and AP2 adapters are in progress
- Hosted dashboard (right now it's localhost only)
- Stripe-style webhook infrastructure for real-time alerts
- Integration with MCP servers (so agents can use PaySentry transparently)
- SOC 2 compliance for the control plane itself

Everything is open-source (MIT license). The repo is at github.com/mkmkkkkk/paysentry. Documentation is at mkyang.ai/paysentry. The full architecture whitepaper (adapted from our earlier AgentGate research) is at mkyang.ai/blog/agentgate-whitepaper.

## Ask HN

I'd love to hear how you're handling agent payments today:

- Are you using x402, ACP, AP2, or something else?
- What's your biggest pain point — observability, policy enforcement, testing, or something I haven't thought of?
- What protocols should we prioritize next?
- If you're running agents in production, how do you monitor their spending?

This started because I lost $2,400 to a timeout bug. I'm hoping PaySentry prevents someone else from losing more. Open to all feedback.

---

GitHub: https://github.com/mkmkkkkk/paysentry
Docs: https://mkyang.ai/paysentry
Whitepaper: https://mkyang.ai/blog/agentgate-whitepaper
