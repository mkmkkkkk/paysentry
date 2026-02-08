import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../src/policy.js';
import { blockAbove, requireApprovalAbove, allowAll } from '../src/rules.js';
import { createTransaction } from '@paysentry/core';
import type { AgentId, PolicyId } from '@paysentry/core';

function makeTx(overrides: Partial<Parameters<typeof createTransaction>[0]> = {}) {
  return createTransaction({
    agentId: 'agent-1' as AgentId,
    recipient: 'https://api.openai.com',
    amount: 10,
    currency: 'USDC',
    purpose: 'test',
    protocol: 'x402',
    ...overrides,
  });
}

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('rule evaluation', () => {
    beforeEach(() => {
      engine.loadPolicy({
        id: 'default' as PolicyId,
        name: 'Default',
        enabled: true,
        rules: [
          blockAbove(1000, 'USDC'),
          requireApprovalAbove(100, 'USDC'),
          allowAll(),
        ],
        budgets: [],
      });
    });

    it('allows small transactions', () => {
      const result = engine.evaluate(makeTx({ amount: 10 }));
      assert.equal(result.allowed, true);
      assert.equal(result.action, 'allow');
    });

    it('requires approval above threshold', () => {
      const result = engine.evaluate(makeTx({ amount: 150 }));
      assert.equal(result.allowed, false);
      assert.equal(result.action, 'require_approval');
    });

    it('blocks above hard limit', () => {
      const result = engine.evaluate(makeTx({ amount: 1500 }));
      assert.equal(result.allowed, false);
      assert.equal(result.action, 'deny');
    });

    it('allows by default with no policies', () => {
      const empty = new PolicyEngine();
      const result = empty.evaluate(makeTx());
      assert.equal(result.allowed, true);
    });
  });

  describe('budget enforcement', () => {
    beforeEach(() => {
      engine.loadPolicy({
        id: 'budgeted' as PolicyId,
        name: 'Budgeted',
        enabled: true,
        rules: [allowAll()],
        budgets: [{ window: 'daily', maxAmount: 100, currency: 'USDC' }],
      });
    });

    it('allows within budget', () => {
      const result = engine.evaluate(makeTx({ amount: 50 }));
      assert.equal(result.allowed, true);
    });

    it('denies when exceeding budget', () => {
      // Record $80 already spent
      engine.recordTransaction(makeTx({ amount: 80 }));
      // Try to spend $30 more (total $110 > $100 limit)
      const result = engine.evaluate(makeTx({ amount: 30 }));
      assert.equal(result.allowed, false);
      assert.equal(result.action, 'deny');
      assert.ok(result.reason.includes('budget exceeded'));
    });

    it('tracks cumulative spend', () => {
      engine.recordTransaction(makeTx({ amount: 40 }));
      engine.recordTransaction(makeTx({ amount: 40 }));
      // $80 spent, $25 more is fine (total $105 > $100)
      const result = engine.evaluate(makeTx({ amount: 25 }));
      assert.equal(result.allowed, false);
    });
  });

  describe('cooldown enforcement', () => {
    it('denies during cooldown period', () => {
      engine.loadPolicy({
        id: 'cooldown' as PolicyId,
        name: 'Cooldown',
        enabled: true,
        rules: [allowAll()],
        budgets: [],
        cooldownMs: 60_000, // 1 min
      });

      engine.recordTransaction(makeTx());
      const result = engine.evaluate(makeTx());
      assert.equal(result.allowed, false);
      assert.ok(result.reason.includes('Cooldown'));
    });
  });

  describe('multi-policy most-restrictive-wins', () => {
    it('picks the most restrictive action across policies', () => {
      engine.loadPolicy({
        id: 'permissive' as PolicyId,
        name: 'Permissive',
        enabled: true,
        rules: [allowAll()],
        budgets: [],
      });
      engine.loadPolicy({
        id: 'strict' as PolicyId,
        name: 'Strict',
        enabled: true,
        rules: [blockAbove(50, 'USDC'), allowAll()],
        budgets: [],
      });

      const result = engine.evaluate(makeTx({ amount: 75 }));
      assert.equal(result.allowed, false);
      assert.equal(result.action, 'deny');
    });
  });

  describe('policy management', () => {
    it('loadPolicy and getPolicies', () => {
      engine.loadPolicy({
        id: 'p1' as PolicyId,
        name: 'P1',
        enabled: true,
        rules: [],
        budgets: [],
      });
      assert.equal(engine.getPolicies().length, 1);
    });

    it('removePolicy', () => {
      engine.loadPolicy({
        id: 'p1' as PolicyId,
        name: 'P1',
        enabled: true,
        rules: [],
        budgets: [],
      });
      assert.equal(engine.removePolicy('p1'), true);
      assert.equal(engine.getPolicies().length, 0);
      assert.equal(engine.removePolicy('nonexistent'), false);
    });

    it('reset clears counters', () => {
      engine.loadPolicy({
        id: 'p1' as PolicyId,
        name: 'P1',
        enabled: true,
        rules: [allowAll()],
        budgets: [{ window: 'daily', maxAmount: 100, currency: 'USDC' }],
      });
      engine.recordTransaction(makeTx({ amount: 90 }));
      engine.reset();
      // After reset, budget should be clear
      const result = engine.evaluate(makeTx({ amount: 90 }));
      assert.equal(result.allowed, true);
    });

    it('skips disabled policies', () => {
      engine.loadPolicy({
        id: 'disabled' as PolicyId,
        name: 'Disabled',
        enabled: false,
        rules: [blockAbove(0, 'USDC')],
        budgets: [],
      });
      const result = engine.evaluate(makeTx({ amount: 9999 }));
      assert.equal(result.allowed, true);
    });
  });
});
