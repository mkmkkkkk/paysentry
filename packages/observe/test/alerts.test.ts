import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpendAlerts } from '../src/alerts.js';
import { SpendTracker } from '../src/tracker.js';
import { createTransaction } from '@paysentry/core';
import type { AgentId, SpendAlert } from '@paysentry/core';

function makeTx(overrides: Record<string, unknown> = {}) {
  const tx = createTransaction({
    agentId: (overrides.agentId as AgentId) ?? ('agent-1' as AgentId),
    recipient: (overrides.recipient as string) ?? 'https://api.openai.com',
    amount: (overrides.amount as number) ?? 10,
    currency: (overrides.currency as string) ?? 'USDC',
    purpose: 'test',
    protocol: 'x402',
  });
  if (overrides.status) tx.status = overrides.status as 'completed';
  return tx;
}

describe('SpendAlerts', () => {
  let tracker: SpendTracker;
  let alerts: SpendAlerts;
  let fired: SpendAlert[];

  beforeEach(() => {
    tracker = new SpendTracker();
    alerts = new SpendAlerts(tracker);
    fired = [];
    alerts.onAlert((a) => { fired.push(a); });
  });

  describe('large_transaction', () => {
    beforeEach(() => {
      alerts.addRule({
        id: 'large-tx',
        name: 'Large TX',
        type: 'large_transaction',
        severity: 'warning',
        enabled: true,
        config: { type: 'large_transaction', threshold: 100, currency: 'USDC' },
      });
    });

    it('fires for large transaction', async () => {
      const result = await alerts.evaluate(makeTx({ amount: 150 }));
      assert.equal(result.length, 1);
      assert.equal(result[0]!.type, 'large_transaction');
      assert.equal(fired.length, 1);
    });

    it('does not fire for small transaction', async () => {
      const result = await alerts.evaluate(makeTx({ amount: 50 }));
      assert.equal(result.length, 0);
    });

    it('ignores different currency', async () => {
      const result = await alerts.evaluate(makeTx({ amount: 500, currency: 'ETH' }));
      assert.equal(result.length, 0);
    });
  });

  describe('budget_threshold', () => {
    beforeEach(() => {
      alerts.addRule({
        id: 'budget-alert',
        name: 'Daily Budget',
        type: 'budget_threshold',
        severity: 'warning',
        enabled: true,
        config: {
          type: 'budget_threshold',
          threshold: 100,
          currency: 'USDC',
          windowMs: 86_400_000,
          alertAtPercent: 0.8,
        },
      });
    });

    it('fires when cumulative spend crosses threshold', async () => {
      // Record $75 in completed transactions
      const old = makeTx({ amount: 75, status: 'completed' });
      tracker.record(old);

      // New $10 tx would bring total to $85 (>80% of $100)
      const result = await alerts.evaluate(makeTx({ amount: 10 }));
      assert.equal(result.length, 1);
      assert.ok(result[0]!.message.includes('Budget'));
    });

    it('does not fire when under threshold', async () => {
      const result = await alerts.evaluate(makeTx({ amount: 5 }));
      assert.equal(result.length, 0);
    });
  });

  describe('rate_spike', () => {
    beforeEach(() => {
      alerts.addRule({
        id: 'rate-spike',
        name: 'Rate Spike',
        type: 'rate_spike',
        severity: 'critical',
        enabled: true,
        config: {
          type: 'rate_spike',
          maxTransactions: 3,
          windowMs: 60_000,
        },
      });
    });

    it('fires when transaction rate exceeds limit', async () => {
      // Record 3 existing transactions
      for (let i = 0; i < 3; i++) tracker.record(makeTx());

      // 4th transaction should trigger
      const result = await alerts.evaluate(makeTx());
      assert.equal(result.length, 1);
      assert.equal(result[0]!.type, 'rate_spike');
      assert.equal(result[0]!.severity, 'critical');
    });
  });

  describe('new_recipient', () => {
    beforeEach(() => {
      alerts.addRule({
        id: 'new-recip',
        name: 'New Recipient',
        type: 'new_recipient',
        severity: 'info',
        enabled: true,
        config: { type: 'new_recipient' },
      });
    });

    it('fires for first-time recipient', async () => {
      const result = await alerts.evaluate(makeTx({ recipient: 'brand-new.com' }));
      assert.equal(result.length, 1);
      assert.equal(result[0]!.type, 'new_recipient');
    });

    it('does not fire for known recipient', async () => {
      tracker.record(makeTx({ recipient: 'known.com' }));

      const result = await alerts.evaluate(makeTx({ recipient: 'known.com' }));
      assert.equal(result.length, 0);
    });
  });

  describe('rule management', () => {
    it('addRule and getRules', () => {
      alerts.addRule({
        id: 'test',
        name: 'Test',
        type: 'large_transaction',
        severity: 'info',
        enabled: true,
        config: { type: 'large_transaction', threshold: 50, currency: 'USDC' },
      });
      assert.equal(alerts.getRules().length, 1);
    });

    it('removeRule', () => {
      alerts.addRule({
        id: 'test',
        name: 'Test',
        type: 'large_transaction',
        severity: 'info',
        enabled: true,
        config: { type: 'large_transaction', threshold: 50, currency: 'USDC' },
      });
      assert.equal(alerts.removeRule('test'), true);
      assert.equal(alerts.getRules().length, 0);
    });

    it('skips disabled rules', async () => {
      alerts.addRule({
        id: 'disabled',
        name: 'Disabled',
        type: 'large_transaction',
        severity: 'warning',
        enabled: false,
        config: { type: 'large_transaction', threshold: 1, currency: 'USDC' },
      });
      const result = await alerts.evaluate(makeTx({ amount: 9999 }));
      assert.equal(result.length, 0);
    });
  });
});
