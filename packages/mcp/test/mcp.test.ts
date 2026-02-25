import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentId, PolicyId } from '@paysentry/core';
import { PaySentryStack, DEFAULT_CONFIG } from '../src/stack.js';

function makeStack(overrides?: Partial<typeof DEFAULT_CONFIG>) {
  return new PaySentryStack({
    ...DEFAULT_CONFIG,
    sandbox: { ...DEFAULT_CONFIG.sandbox, failureRate: 0, latencyMs: 0 },
    ...overrides,
  });
}

describe('PaySentryStack', () => {
  describe('processPayment', () => {
    it('completes a payment within limits', async () => {
      const stack = makeStack();
      const result = await stack.processPayment('https://vendor-a.example.com', 25, 'USD', 'test purchase');

      assert.equal(result.success, true);
      assert.equal(result.status, 'completed');
      assert.ok(result.transactionId.startsWith('ps_'));
      assert.ok(result.message.includes('$25.00'));
    });

    it('blocks payment above per-transaction limit', async () => {
      const stack = makeStack();
      const result = await stack.processPayment('https://vendor-a.example.com', 200, 'USD', 'too expensive');

      assert.equal(result.success, false);
      assert.equal(result.status, 'blocked');
      assert.ok(result.message.includes('blocked'));
    });

    it('requires approval above threshold', async () => {
      const stack = makeStack();
      const result = await stack.processPayment('https://vendor-a.example.com', 75, 'USD', 'mid-range');

      assert.equal(result.success, false);
      assert.equal(result.status, 'requires_approval');
    });

    it('blocks when balance insufficient', async () => {
      const stack = makeStack({ sandbox: { ...DEFAULT_CONFIG.sandbox, initialBalance: 10 } });
      const result = await stack.processPayment('https://vendor-a.example.com', 25, 'USD', 'over balance');

      assert.equal(result.success, false);
      assert.ok(result.message.includes('Insufficient balance'));
    });

    it('deducts balance on success', async () => {
      const stack = makeStack();
      await stack.processPayment('https://vendor-a.example.com', 30, 'USD', 'first');
      const balance = stack.getBalanceInfo();
      assert.equal(balance.balance, 9970);
      assert.equal(balance.totalSpent, 30);
    });

    it('records provenance for each payment', async () => {
      const stack = makeStack();
      const result = await stack.processPayment('https://vendor-a.example.com', 10, 'USD', 'tracked');
      const trail = stack.getAuditTrail(result.transactionId);
      assert.ok(trail.length >= 2); // intent + policy check + settlement
    });
  });

  describe('policy CRUD', () => {
    it('lists default policy', () => {
      const stack = makeStack();
      const policies = stack.listPolicies();
      assert.equal(policies.length, 1);
      assert.equal(policies[0].id, 'mcp-default');
    });

    it('gets policy by ID', () => {
      const stack = makeStack();
      const policy = stack.getPolicy('mcp-default');
      assert.ok(policy);
      assert.equal(policy.name, 'Default Agent Payment Policy');
    });

    it('creates and removes policy', () => {
      const stack = makeStack();
      stack.createPolicy({
        id: 'custom-1' as PolicyId,
        name: 'Custom',
        enabled: true,
        rules: [],
        budgets: [],
      });
      assert.equal(stack.listPolicies().length, 2);

      const removed = stack.removePolicy('custom-1');
      assert.equal(removed, true);
      assert.equal(stack.listPolicies().length, 1);
    });

    it('returns false when removing nonexistent policy', () => {
      const stack = makeStack();
      assert.equal(stack.removePolicy('does-not-exist'), false);
    });
  });

  describe('evaluateDryRun', () => {
    it('evaluates without executing', () => {
      const stack = makeStack();
      const result = stack.evaluateDryRun('vendor', 25, 'USD');
      assert.equal(result.allowed, true);
      assert.equal(result.action, 'allow');
      // Balance should be unchanged
      assert.equal(stack.getBalanceInfo().balance, 10000);
    });

    it('dry-run detects blocking rules', () => {
      const stack = makeStack();
      const result = stack.evaluateDryRun('vendor', 200, 'USD');
      assert.equal(result.allowed, false);
      assert.equal(result.action, 'deny');
    });
  });

  describe('disputes', () => {
    it('files and lists disputes', async () => {
      const stack = makeStack();
      const payment = await stack.processPayment('https://vendor-a.example.com', 20, 'USD', 'bad service');

      const dispute = stack.fileDispute(payment.transactionId, 'Service not delivered');
      assert.equal(dispute.status, 'open');
      assert.ok(dispute.id);

      const all = stack.listDisputes();
      assert.equal(all.length, 1);
    });
  });

  describe('getBalanceInfo', () => {
    it('returns budget info', () => {
      const stack = makeStack();
      const info = stack.getBalanceInfo();
      assert.equal(info.balance, 10000);
      assert.equal(info.currency, 'USD');
      assert.equal(info.dailyBudget.limit, 500);
      assert.equal(info.hourlyBudget.limit, 200);
    });
  });

  describe('getPaymentHistory', () => {
    it('returns empty initially', () => {
      const stack = makeStack();
      const history = stack.getPaymentHistory();
      assert.equal(history.transactions.length, 0);
      assert.equal(history.totalCount, 0);
    });

    it('tracks completed payments', async () => {
      const stack = makeStack();
      await stack.processPayment('https://vendor-a.example.com', 10, 'USD', 'test');
      await stack.processPayment('https://vendor-b.example.com', 20, 'USD', 'test2');

      const history = stack.getPaymentHistory();
      assert.equal(history.transactions.length, 2);
      assert.equal(history.totalCount, 2);
    });
  });

  describe('alert log', () => {
    it('captures alerts from large transactions', async () => {
      const stack = makeStack({
        alerts: { ...DEFAULT_CONFIG.alerts, largeTransactionThreshold: 5 },
      });
      await stack.processPayment('https://vendor-a.example.com', 10, 'USD', 'big one');

      const alerts = stack.getAlertLog();
      assert.ok(alerts.length > 0);
    });
  });
});
