#!/usr/bin/env node
// =============================================================================
// paysentry-dashboard CLI — run the dashboard HTTP server
//
// Usage:
//   npx paysentry-dashboard
//
// Environment variables (all optional):
//   PAYSENTRY_DASHBOARD_PORT  — HTTP port (default: 3100)
//   PAYSENTRY_DASHBOARD_HOST  — Bind address (default: 0.0.0.0)
//   PAYSENTRY_DASHBOARD_TOKEN — Bearer token for auth (optional, if set all requests require it)
// =============================================================================

import { createDashboardServer } from './index.js';
import { PolicyEngine } from '@paysentry/control';
import { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';
import { TransactionProvenance, DisputeManager } from '@paysentry/protect';
import { EventBus } from '@paysentry/core';

const port = parseInt(process.env.PAYSENTRY_DASHBOARD_PORT ?? '3100') || 3100;
const host = process.env.PAYSENTRY_DASHBOARD_HOST ?? '0.0.0.0';
const bearerToken = process.env.PAYSENTRY_DASHBOARD_TOKEN;

const tracker = new SpendTracker();

const server = createDashboardServer(
  {
    policyEngine: new PolicyEngine(),
    tracker,
    analytics: new SpendAnalytics(tracker),
    provenance: new TransactionProvenance(),
    disputes: new DisputeManager(),
    events: new EventBus(),
  },
  { port, host, bearerToken },
);

process.stderr.write(`\n  PaySentry Dashboard v1.0.0\n`);
process.stderr.write(`  Listening on http://${host}:${port}\n`);
process.stderr.write(`  Auth: ${bearerToken ? 'Bearer token required' : 'none (set PAYSENTRY_DASHBOARD_TOKEN to enable)'}\n`);
process.stderr.write(`  Endpoints: /status /transactions /policies /alerts /disputes /agents /events\n`);
process.stderr.write(`  Ready.\n\n`);
