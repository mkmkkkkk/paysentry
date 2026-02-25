import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentId, IntentId, MandateId, EscrowId, AgentCapability } from '@paysentry/core';
import {
  PaymentIntentManager,
  MandateManager,
  EscrowManager,
  AgentRegistry,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// PaymentIntentManager
// ---------------------------------------------------------------------------

describe('PaymentIntentManager', () => {
  let intents: PaymentIntentManager;

  beforeEach(() => {
    intents = new PaymentIntentManager();
  });

  describe('propose', () => {
    it('creates an intent with proposed status', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 50,
        currency: 'USDC',
        purpose: 'test payment',
      });

      assert.equal(intent.status, 'proposed');
      assert.equal(intent.amount, 50);
      assert.equal(intent.from, 'agent-a');
      assert.equal(intent.to, 'agent-b');
      assert.ok(intent.id.startsWith('int_'));
    });

    it('sets default expiry of 1 hour', () => {
      const before = Date.now();
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 10,
        currency: 'USDC',
        purpose: 'test',
      });
      const expires = new Date(intent.expiresAt).getTime();
      assert.ok(expires >= before + 3_500_000); // ~1 hour, allowing some slack
      assert.ok(expires <= before + 3_700_000);
    });
  });

  describe('accept', () => {
    it('transitions from proposed to accepted', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 25,
        currency: 'USDC',
        purpose: 'test',
      });

      const accepted = intents.accept(intent.id);
      assert.equal(accepted.status, 'accepted');
    });

    it('throws if already rejected', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 25,
        currency: 'USDC',
        purpose: 'test',
      });
      intents.reject(intent.id, 'no thanks');

      assert.throws(() => intents.accept(intent.id), /status "rejected"/);
    });
  });

  describe('reject', () => {
    it('transitions to rejected', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 25,
        currency: 'USDC',
        purpose: 'test',
      });

      const rejected = intents.reject(intent.id, 'too expensive');
      assert.equal(rejected.status, 'rejected');
    });
  });

  describe('counter', () => {
    it('transitions to countered with new amount', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 100,
        currency: 'USDC',
        purpose: 'test',
      });

      const countered = intents.counter(intent.id, { amount: 75, reason: 'too much' });
      assert.equal(countered.status, 'countered');
      assert.equal(countered.counterOffer?.amount, 75);
    });

    it('accepts after counter', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 100,
        currency: 'USDC',
        purpose: 'test',
      });
      intents.counter(intent.id, { amount: 75, reason: 'less' });
      const accepted = intents.accept(intent.id);
      assert.equal(accepted.status, 'accepted');
    });
  });

  describe('markExecuted', () => {
    it('transitions from accepted to executed', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 10,
        currency: 'USDC',
        purpose: 'test',
      });
      intents.accept(intent.id);
      const executed = intents.markExecuted(intent.id);
      assert.equal(executed.status, 'executed');
    });

    it('throws if not accepted', () => {
      const intent = intents.propose({
        from: 'agent-a' as AgentId,
        to: 'agent-b' as AgentId,
        amount: 10,
        currency: 'USDC',
        purpose: 'test',
      });
      assert.throws(() => intents.markExecuted(intent.id), /status "proposed"/);
    });
  });

  describe('listForAgent', () => {
    it('lists intents for specific agent', () => {
      intents.propose({ from: 'a' as AgentId, to: 'b' as AgentId, amount: 10, currency: 'USDC', purpose: 't' });
      intents.propose({ from: 'b' as AgentId, to: 'c' as AgentId, amount: 20, currency: 'USDC', purpose: 't' });
      intents.propose({ from: 'c' as AgentId, to: 'a' as AgentId, amount: 30, currency: 'USDC', purpose: 't' });

      const forA = intents.listForAgent('a' as AgentId);
      assert.equal(forA.length, 2); // from:a and to:a

      const fromA = intents.listForAgent('a' as AgentId, 'from');
      assert.equal(fromA.length, 1);
    });
  });

  describe('not found', () => {
    it('throws for unknown intent', () => {
      assert.throws(() => intents.accept('int_nonexistent' as IntentId), /not found/);
    });
  });
});

// ---------------------------------------------------------------------------
// MandateManager
// ---------------------------------------------------------------------------

describe('MandateManager', () => {
  let mandates: MandateManager;

  beforeEach(() => {
    mandates = new MandateManager();
  });

  it('creates a mandate', () => {
    const m = mandates.create({
      grantor: 'a' as AgentId,
      grantee: 'b' as AgentId,
      maxPerTransaction: 50,
      maxCumulative: 500,
      currency: 'USDC',
    });

    assert.equal(m.status, 'active');
    assert.ok(m.id.startsWith('mdt_'));
    assert.equal(m.spent, 0);
    assert.equal(m.transactionCount, 0);
  });

  it('validates spend within limits', () => {
    const m = mandates.create({
      grantor: 'a' as AgentId,
      grantee: 'b' as AgentId,
      maxPerTransaction: 100,
      maxCumulative: 500,
      currency: 'USDC',
    });

    const result = mandates.validate(m.id, 50);
    assert.equal(result.allowed, true);
  });

  it('rejects spend exceeding per-transaction limit', () => {
    const m = mandates.create({
      grantor: 'a' as AgentId,
      grantee: 'b' as AgentId,
      maxPerTransaction: 100,
      maxCumulative: 500,
      currency: 'USDC',
    });

    const result = mandates.validate(m.id, 150);
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('exceeds'));
  });

  it('tracks cumulative spend', () => {
    const m = mandates.create({
      grantor: 'a' as AgentId,
      grantee: 'b' as AgentId,
      maxPerTransaction: 100,
      maxCumulative: 100,
      currency: 'USDC',
    });

    mandates.recordSpend(m.id, 30);
    mandates.recordSpend(m.id, 40);

    // 30 + 40 + 40 = 110 > 100 cumulative
    const result = mandates.validate(m.id, 40);
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('Cumulative'));
  });

  it('revokes a mandate', () => {
    const m = mandates.create({
      grantor: 'a' as AgentId,
      grantee: 'b' as AgentId,
      maxPerTransaction: 100,
      maxCumulative: 500,
      currency: 'USDC',
    });

    mandates.revoke(m.id);
    const result = mandates.validate(m.id, 10);
    assert.equal(result.allowed, false);
    assert.ok(result.reason.includes('revoked'));
  });
});

// ---------------------------------------------------------------------------
// EscrowManager
// ---------------------------------------------------------------------------

describe('EscrowManager', () => {
  let escrow: EscrowManager;

  beforeEach(() => {
    escrow = new EscrowManager();
  });

  it('creates an escrow contract', () => {
    const c = escrow.create({
      payer: 'a' as AgentId,
      payee: 'b' as AgentId,
      amount: 200,
      currency: 'USDC',
      purpose: 'Data delivery',
      conditions: [
        { type: 'service_delivered', description: 'Data delivered', satisfied: false },
      ],
    });

    assert.equal(c.status, 'funded');
    assert.ok(c.id.startsWith('esc_'));
    assert.equal(c.conditions.length, 1);
  });

  it('satisfies conditions by index', () => {
    const c = escrow.create({
      payer: 'a' as AgentId,
      payee: 'b' as AgentId,
      amount: 200,
      currency: 'USDC',
      purpose: 'Test',
      conditions: [
        { type: 'service_delivered', description: 'Done', satisfied: false },
        { type: 'approval_obtained', description: 'Verified', satisfied: false },
      ],
    });

    escrow.satisfyCondition(c.id, 0);
    const updated = escrow.get(c.id)!;
    assert.equal(updated.conditions[0].satisfied, true);
    assert.equal(updated.conditions[1].satisfied, false);
  });

  it('releases when all conditions met', () => {
    const c = escrow.create({
      payer: 'a' as AgentId,
      payee: 'b' as AgentId,
      amount: 200,
      currency: 'USDC',
      purpose: 'Test',
      conditions: [
        { type: 'service_delivered', description: 'Done', satisfied: false },
      ],
    });

    escrow.satisfyCondition(c.id, 0);
    const released = escrow.release(c.id);
    assert.equal(released.status, 'released');
  });

  it('throws on release with unsatisfied conditions', () => {
    const c = escrow.create({
      payer: 'a' as AgentId,
      payee: 'b' as AgentId,
      amount: 200,
      currency: 'USDC',
      purpose: 'Test',
      conditions: [
        { type: 'service_delivered', description: 'Done', satisfied: false },
      ],
    });

    assert.throws(() => escrow.release(c.id), /expected: conditions_met/);
  });

  it('refunds to payer', () => {
    const c = escrow.create({
      payer: 'a' as AgentId,
      payee: 'b' as AgentId,
      amount: 200,
      currency: 'USDC',
      purpose: 'Test',
      conditions: [],
    });

    const refunded = escrow.refund(c.id);
    assert.equal(refunded.status, 'refunded');
  });
});

// ---------------------------------------------------------------------------
// AgentRegistry
// ---------------------------------------------------------------------------

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('registers an agent', () => {
    const agent = registry.register({
      name: 'Research Agent',
      capabilities: ['pay', 'negotiate'] as AgentCapability[],
    });

    assert.ok(agent.id.startsWith('agt_'));
    assert.equal(agent.name, 'Research Agent');
    assert.equal(agent.trustScore, 50); // default neutral
  });

  it('registers with specific ID', () => {
    const agent = registry.registerWithId('agent-1' as AgentId, {
      name: 'Agent One',
      capabilities: ['pay'] as AgentCapability[],
    });

    assert.equal(agent.id, 'agent-1');
    const fetched = registry.get('agent-1' as AgentId);
    assert.ok(fetched);
    assert.equal(fetched.name, 'Agent One');
  });

  it('lists all agents', () => {
    registry.register({ name: 'A', capabilities: [] });
    registry.register({ name: 'B', capabilities: [] });

    const all = registry.list();
    assert.equal(all.length, 2);
  });

  it('updates trust score via events', () => {
    const agent = registry.register({ name: 'A', capabilities: [] });
    registry.updateTrustScore(agent.id, 'completed'); // +1
    registry.updateTrustScore(agent.id, 'completed'); // +1

    const updated = registry.get(agent.id)!;
    assert.equal(updated.trustScore, 52); // 50 + 1 + 1
  });

  it('decreases trust on disputes', () => {
    const agent = registry.register({ name: 'A', capabilities: [] });
    registry.updateTrustScore(agent.id, 'disputed'); // -5

    const updated = registry.get(agent.id)!;
    assert.equal(updated.trustScore, 45); // 50 - 5
  });

  it('checks capabilities', () => {
    const agent = registry.register({
      name: 'A',
      capabilities: ['pay', 'negotiate'] as AgentCapability[],
    });

    assert.equal(registry.hasCapability(agent.id, 'pay'), true);
    assert.equal(registry.hasCapability(agent.id, 'dispute'), false);
  });

  it('returns undefined for unknown agent', () => {
    assert.equal(registry.get('unknown' as AgentId), undefined);
  });

  it('reports correct size', () => {
    assert.equal(registry.size, 0);
    registry.register({ name: 'A', capabilities: [] });
    assert.equal(registry.size, 1);
  });
});
