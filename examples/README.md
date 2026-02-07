# PaySentry Examples

Runnable examples demonstrating each PaySentry pillar.

## Prerequisites

```bash
npm install
```

## Examples

| File | Pillar | Description |
|------|--------|-------------|
| `quickstart.ts` | All | All 4 pillars in 5 minutes |
| `01-observe.ts` | Observe | SpendTracker, SpendAnalytics, SpendAlerts |
| `02-control.ts` | Control | PolicyEngine, rules, budgets, allowlists |
| `03-sandbox.ts` | Sandbox | MockX402, MockACP, MockAP2, failure simulation |
| `04-full-integration.ts` | All | End-to-end agent payment workflow with dispute resolution |

## Running

```bash
# Run any example with tsx
npx tsx examples/quickstart.ts
npx tsx examples/01-observe.ts
npx tsx examples/02-control.ts
npx tsx examples/03-sandbox.ts
npx tsx examples/04-full-integration.ts
```

## What Each Example Covers

### `01-observe.ts` — Payment Observability

- **SpendTracker**: Record transactions, query by agent/service/recipient, filter with criteria
- **SpendAnalytics**: Per-agent spend summaries, top recipients, agent leaderboard, platform totals
- **SpendAlerts**: Budget thresholds, large transaction detection, new recipient alerts

### `02-control.ts` — Policy Engine

- **Pre-built rules**: `blockAbove()`, `requireApprovalAbove()`, `blockRecipient()`, `allowAll()`, `denyAll()`
- **Budget enforcement**: Daily/monthly spend caps with automatic tracking
- **RuleBuilder**: Fluent API for custom rules with conditions on agents, recipients, protocols, amounts
- **Allowlist policy**: Restrict payments to approved recipients only

### `03-sandbox.ts` — Payment Sandbox

- **MockX402**: x402 protocol simulation with currency validation, amount limits, URL checks
- **MockACP**: Agent Commerce Protocol with wallet balances, declined merchants, payment methods
- **MockAP2**: Agent-to-agent mandates with per-transaction and cumulative limits, revocation
- **Failure simulation**: Configurable failure rates for resilience testing
- **Test scenarios**: 9 pre-built scenarios covering common payment patterns

### `04-full-integration.ts` — Full Integration

Four end-to-end workflows demonstrating all pillars working together:

1. **Happy path**: Intent -> Policy check -> Execute -> Settle -> Track
2. **Approval flow**: Policy triggers `require_approval` -> Human approves -> Execute
3. **Blocked payment**: Policy denies -> No execution
4. **Dispute & recovery**: Execute -> Settlement fails -> Dispute filed -> Investigated -> Resolved -> Automated refund
