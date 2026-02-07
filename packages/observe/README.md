# @paysentry/observe

Payment observability for AI agents. Track what agents spend, where, and why — across x402, ACP, AP2, and Visa TAP.

Part of [PaySentry](https://github.com/mkmkkkkk/paysentry).

## Install

```bash
npm install @paysentry/observe @paysentry/core
```

## Quick Start

```typescript
import { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';

const tracker = new SpendTracker();
const analytics = new SpendAnalytics(tracker);
const alerts = new SpendAlerts(tracker);

// Track a transaction
tracker.record(tx);

// Get per-agent analytics
const report = analytics.getAgentAnalytics('my-agent');
console.log(report.spendByProtocol);
// Map { 'x402:USDC' => { totalAmount: 12.50, transactionCount: 250 } }

// Alert when daily spend exceeds 80% of budget
alerts.addRule({
  id: 'daily-budget',
  type: 'budget_threshold',
  severity: 'warning',
  config: {
    threshold: 500,
    currency: 'USDC',
    windowMs: 86400000,
    alertAtPercent: 0.8,
  },
});

alerts.onAlert((alert) => {
  console.log(`[${alert.severity}] ${alert.message}`);
});
```

## Features

- **SpendTracker** — Real-time transaction indexing by agent, service, protocol
- **SpendAnalytics** — Time-series analytics, per-agent breakdowns, anomaly detection (z-score)
- **SpendAlerts** — Budget thresholds, rate spike detection, new recipient alerts

## License

MIT
