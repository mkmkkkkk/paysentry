# @paysentry/control

Declarative policy engine for AI agent payment control. Set spending limits, enforce budgets, require human approval — all without touching your agent code.

Part of [PaySentry](https://github.com/mkmkkkkk/paysentry).

## Install

```bash
npm install @paysentry/control @paysentry/core
```

## Quick Start

```typescript
import { PolicyEngine, blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';
import { createTransaction } from '@paysentry/core';

const engine = new PolicyEngine();

engine.loadPolicy({
  id: 'production',
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
  cooldownMs: 1000,
});

const tx = createTransaction({
  agentId: 'my-agent',
  recipient: 'api.example.com',
  amount: 50,
  currency: 'USDC',
  purpose: 'API call',
  protocol: 'x402',
});

const result = engine.evaluate(tx);
// result.allowed: boolean
// result.action: 'allow' | 'deny' | 'require_approval' | 'flag'
```

## Features

- **Declarative policies** — JSON/YAML config, no code changes needed
- **Per-agent budgets** — Daily, weekly, monthly spending limits
- **Velocity checks** — Rate limiting and cooldown periods
- **Rule priorities** — First-match evaluation with explicit ordering
- **Express/Fastify middleware** — Drop-in HTTP middleware
- **Deterministic** — No LLM in the decision path

## Express Middleware

```typescript
import { createPolicyMiddleware } from '@paysentry/control';

app.use('/pay', createPolicyMiddleware({ engine }));
```

## License

MIT
