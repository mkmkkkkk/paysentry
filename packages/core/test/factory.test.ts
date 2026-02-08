import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTransaction } from '../src/factory.js';
import type { AgentId } from '../src/types.js';

describe('createTransaction', () => {
  const input = {
    agentId: 'agent-1' as AgentId,
    recipient: 'https://api.openai.com',
    amount: 0.05,
    currency: 'USDC',
    purpose: 'GPT-4 call',
    protocol: 'x402' as const,
  };

  it('generates ID with ps_ prefix', () => {
    const tx = createTransaction(input);
    assert.ok(tx.id.startsWith('ps_'));
  });

  it('sets ISO 8601 timestamps', () => {
    const tx = createTransaction(input);
    assert.ok(!Number.isNaN(Date.parse(tx.createdAt)));
    assert.equal(tx.createdAt, tx.updatedAt);
  });

  it('defaults status to pending', () => {
    const tx = createTransaction(input);
    assert.equal(tx.status, 'pending');
  });

  it('preserves all input fields', () => {
    const tx = createTransaction(input);
    assert.equal(tx.agentId, 'agent-1');
    assert.equal(tx.recipient, 'https://api.openai.com');
    assert.equal(tx.amount, 0.05);
    assert.equal(tx.currency, 'USDC');
    assert.equal(tx.purpose, 'GPT-4 call');
    assert.equal(tx.protocol, 'x402');
  });

  it('freezes metadata', () => {
    const tx = createTransaction({ ...input, metadata: { key: 'val' } });
    assert.ok(Object.isFrozen(tx.metadata));
    assert.equal(tx.metadata.key, 'val');
  });
});
