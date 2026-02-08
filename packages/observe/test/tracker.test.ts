import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpendTracker } from '../src/tracker.js';
import { createTransaction } from '@paysentry/core';
import type { AgentId } from '@paysentry/core';

function makeTx(overrides: Record<string, unknown> = {}) {
  return createTransaction({
    agentId: (overrides.agentId as AgentId) ?? ('agent-1' as AgentId),
    recipient: (overrides.recipient as string) ?? 'https://api.openai.com',
    amount: (overrides.amount as number) ?? 10,
    currency: (overrides.currency as string) ?? 'USDC',
    purpose: 'test',
    protocol: 'x402',
  });
}

describe('SpendTracker', () => {
  let tracker: SpendTracker;

  beforeEach(() => {
    tracker = new SpendTracker();
  });

  it('records and retrieves by id', () => {
    const tx = makeTx();
    tracker.record(tx);
    assert.equal(tracker.get(tx.id)?.id, tx.id);
    assert.equal(tracker.size, 1);
  });

  it('getByAgent returns agent transactions', () => {
    tracker.record(makeTx({ agentId: 'a' as AgentId }));
    tracker.record(makeTx({ agentId: 'a' as AgentId }));
    tracker.record(makeTx({ agentId: 'b' as AgentId }));

    const aTxs = tracker.getByAgent('a' as AgentId);
    assert.equal(aTxs.length, 2);
    assert.ok(aTxs.every((t) => t.agentId === 'a'));
  });

  it('getByRecipient returns recipient transactions', () => {
    tracker.record(makeTx({ recipient: 'r1' }));
    tracker.record(makeTx({ recipient: 'r2' }));
    tracker.record(makeTx({ recipient: 'r1' }));

    const r1Txs = tracker.getByRecipient('r1');
    assert.equal(r1Txs.length, 2);
  });

  it('query with filters', () => {
    const tx1 = makeTx({ amount: 5, currency: 'USDC' });
    const tx2 = makeTx({ amount: 50, currency: 'USDC' });
    const tx3 = makeTx({ amount: 100, currency: 'ETH' });
    tracker.record(tx1);
    tracker.record(tx2);
    tracker.record(tx3);

    const result = tracker.query({ currency: 'USDC', minAmount: 10 });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.amount, 50);
  });

  it('query with limit', () => {
    for (let i = 0; i < 5; i++) tracker.record(makeTx());
    const result = tracker.query({ limit: 2 });
    assert.equal(result.length, 2);
  });

  it('returns empty for unknown agent', () => {
    assert.equal(tracker.getByAgent('nonexistent' as AgentId).length, 0);
  });

  it('tracks agents and recipients', () => {
    tracker.record(makeTx({ agentId: 'a1' as AgentId, recipient: 'r1' }));
    tracker.record(makeTx({ agentId: 'a2' as AgentId, recipient: 'r2' }));
    assert.equal(tracker.agents.length, 2);
    assert.equal(tracker.recipients.length, 2);
  });

  it('updates existing transaction on re-record', () => {
    const tx = makeTx();
    tracker.record(tx);
    tx.status = 'completed';
    tracker.record(tx);
    assert.equal(tracker.size, 1);
    assert.equal(tracker.get(tx.id)?.status, 'completed');
  });
});
