import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAmount,
  extractRecipient,
  extractAgent,
  mapToTransaction,
  transactionKey,
} from '../src/transaction-mapper.js';
import type { X402PaymentPayload, X402PaymentRequirements, X402PaySentryConfig } from '../src/types.js';
import type { AgentId } from '@paysentry/core';

const mockPayload: X402PaymentPayload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'base-sepolia',
  payload: 'signed-data',
  resource: 'https://api.example.com/data',
  payer: '0xABCD1234',
};

const mockRequirements: X402PaymentRequirements = {
  scheme: 'exact',
  network: 'base-sepolia',
  maxAmountRequired: '5000000', // 5 USDC in 6-decimal base units
  resource: 'https://api.example.com/data',
  payTo: '0xRecipient',
  description: 'API access fee',
};

describe('extractAmount', () => {
  it('converts USDC base units (6 decimals)', () => {
    const amount = extractAmount(mockRequirements);
    assert.equal(amount, 5); // 5_000_000 / 1e6 = 5
  });

  it('converts ETH base units (18 decimals)', () => {
    const ethReq = { ...mockRequirements, scheme: 'ethereum', maxAmountRequired: '1000000000000000000' };
    const amount = extractAmount(ethReq);
    assert.equal(amount, 1); // 1e18 / 1e18 = 1
  });

  it('returns 0 for missing amount', () => {
    const empty = { ...mockRequirements, maxAmountRequired: '' };
    assert.equal(extractAmount(empty), 0);
  });

  it('returns 0 for NaN amount', () => {
    const bad = { ...mockRequirements, maxAmountRequired: 'not-a-number' };
    assert.equal(extractAmount(bad), 0);
  });
});

describe('extractRecipient', () => {
  it('returns payTo address', () => {
    assert.equal(extractRecipient(mockRequirements), '0xRecipient');
  });
});

describe('extractAgent', () => {
  it('uses payer from payload', async () => {
    const config: X402PaySentryConfig = {};
    const agent = await extractAgent(mockPayload, config);
    assert.equal(agent, '0xABCD1234');
  });

  it('uses resolveAgentId when provided', async () => {
    const config: X402PaySentryConfig = {
      resolveAgentId: (addr: string) => `agent-${addr}` as AgentId,
    };
    const agent = await extractAgent(mockPayload, config);
    assert.equal(agent, 'agent-0xABCD1234');
  });

  it('falls back to defaultAgentId', async () => {
    const payloadNoPayer = { ...mockPayload, payer: undefined };
    const config: X402PaySentryConfig = { defaultAgentId: 'fallback' as AgentId };
    const agent = await extractAgent(payloadNoPayer as X402PaymentPayload, config);
    assert.equal(agent, 'fallback');
  });

  it('falls back to unknown-agent', async () => {
    const payloadNoPayer = { ...mockPayload, payer: undefined };
    const config: X402PaySentryConfig = {};
    const agent = await extractAgent(payloadNoPayer as X402PaymentPayload, config);
    assert.equal(agent, 'unknown-agent');
  });
});

describe('mapToTransaction', () => {
  it('creates full AgentTransaction', async () => {
    const config: X402PaySentryConfig = {};
    const tx = await mapToTransaction(mockPayload, mockRequirements, config);

    assert.equal(tx.agentId, '0xABCD1234');
    assert.equal(tx.amount, 5);
    assert.equal(tx.recipient, '0xRecipient');
    assert.equal(tx.currency, 'USDC');
    assert.equal(tx.protocol, 'x402');
    assert.equal(tx.status, 'pending');
    assert.equal(tx.purpose, 'API access fee');
  });
});

describe('transactionKey', () => {
  it('creates deterministic key', () => {
    const key = transactionKey(mockPayload, mockRequirements);
    assert.equal(key, 'x402:0xABCD1234:0xRecipient:5000000');
  });
});
