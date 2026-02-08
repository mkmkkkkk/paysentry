import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PaySentryX402Adapter } from '../src/adapter.js';
import { CircuitBreakerOpenError } from '../src/circuit-breaker.js';
import { PolicyEngine, blockAbove, allowAll } from '@paysentry/control';
import { SpendTracker, SpendAlerts } from '@paysentry/observe';
import { TransactionProvenance } from '@paysentry/protect';
import type { PolicyId, AgentId } from '@paysentry/core';
import type { X402FacilitatorClient, X402PaymentPayload, X402PaymentRequirements } from '../src/types.js';

const payload: X402PaymentPayload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'base-sepolia',
  payload: 'signed-data',
  resource: 'https://api.example.com/data',
  payer: '0xAgent',
};

const requirements: X402PaymentRequirements = {
  scheme: 'exact',
  network: 'base-sepolia',
  maxAmountRequired: '5000000', // $5 USDC
  resource: 'https://api.example.com/data',
  payTo: '0xRecipient',
  description: 'API access',
};

function createMockFacilitator(opts: { verifyValid?: boolean; settleSuccess?: boolean; shouldThrow?: boolean } = {}): X402FacilitatorClient {
  const { verifyValid = true, settleSuccess = true, shouldThrow = false } = opts;
  return {
    async verify() {
      if (shouldThrow) throw new Error('facilitator down');
      return { isValid: verifyValid, payer: '0xAgent' };
    },
    async settle() {
      if (shouldThrow) throw new Error('facilitator down');
      return { success: settleSuccess, txHash: '0xTxHash123', network: 'base-sepolia' };
    },
    async supported() {
      return { schemes: ['exact'], networks: ['base-sepolia'] };
    },
  };
}

describe('PaySentryX402Adapter', () => {
  let engine: PolicyEngine;
  let tracker: SpendTracker;
  let provenance: TransactionProvenance;
  let alerts: SpendAlerts;

  beforeEach(() => {
    engine = new PolicyEngine();
    engine.loadPolicy({
      id: 'default' as PolicyId,
      name: 'Default',
      enabled: true,
      rules: [blockAbove(1000, 'USDC'), allowAll()],
      budgets: [{ window: 'daily', maxAmount: 500, currency: 'USDC' }],
    });

    tracker = new SpendTracker();
    provenance = new TransactionProvenance();
    alerts = new SpendAlerts(tracker);
  });

  describe('wrapFacilitatorClient — verify + settle', () => {
    it('full allow flow: verify then settle', async () => {
      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker, spendAlerts: alerts, provenance },
        { defaultCurrency: 'USDC' },
      );

      const wrapped = adapter.wrapFacilitatorClient(createMockFacilitator());

      // Verify
      const verifyResult = await wrapped.verify(payload, requirements);
      assert.equal(verifyResult.isValid, true);

      // Settle
      const settleResult = await wrapped.settle(payload, requirements);
      assert.equal(settleResult.success, true);
      assert.equal(settleResult.txHash, '0xTxHash123');

      // Transaction recorded
      assert.equal(tracker.size, 1);
      const txs = tracker.getByAgent('0xAgent' as AgentId);
      assert.equal(txs.length, 1);
      assert.equal(txs[0]!.status, 'completed');
      assert.equal(txs[0]!.amount, 5);

      // Provenance chain exists
      const chain = provenance.getChain(txs[0]!.id);
      assert.ok(chain.length >= 2); // policy_check + execution + settlement
    });

    it('policy deny returns invalid verify', async () => {
      // Make requirements exceed block limit ($1500)
      const bigRequirements = { ...requirements, maxAmountRequired: '1500000000' };

      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker, provenance },
        { defaultCurrency: 'USDC' },
      );
      const wrapped = adapter.wrapFacilitatorClient(createMockFacilitator());

      const verifyResult = await wrapped.verify(payload, bigRequirements);
      assert.equal(verifyResult.isValid, false);
      assert.ok(verifyResult.invalidReason?.includes('PaySentry policy denied'));
    });

    it('failed settle records failure', async () => {
      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker, provenance },
        { defaultCurrency: 'USDC' },
      );
      const wrapped = adapter.wrapFacilitatorClient(createMockFacilitator({ settleSuccess: false }));

      await wrapped.verify(payload, requirements);
      const settleResult = await wrapped.settle(payload, requirements);
      assert.equal(settleResult.success, false);

      assert.equal(tracker.size, 1);
      const txs = tracker.getByAgent('0xAgent' as AgentId);
      assert.equal(txs[0]!.status, 'failed');
    });
  });

  describe('circuit breaker integration', () => {
    it('opens after repeated failures', async () => {
      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker },
        { circuitBreaker: { failureThreshold: 2, recoveryTimeoutMs: 5000 } },
      );
      const wrapped = adapter.wrapFacilitatorClient(createMockFacilitator({ shouldThrow: true }), 'flaky');

      // 2 failures trip the breaker
      await assert.rejects(() => wrapped.verify(payload, requirements));
      await assert.rejects(() => wrapped.verify(payload, requirements));

      // 3rd call should be circuit breaker rejection
      await assert.rejects(
        () => wrapped.verify(payload, requirements),
        (err: unknown) => err instanceof CircuitBreakerOpenError,
      );
    });
  });

  describe('supported() passthrough', () => {
    it('delegates directly', async () => {
      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker },
      );
      const wrapped = adapter.wrapFacilitatorClient(createMockFacilitator());
      const result = await wrapped.supported();
      assert.deepEqual(result.schemes, ['exact']);
    });
  });

  describe('createExtension', () => {
    it('returns extension with key', () => {
      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker },
      );
      const ext = adapter.createExtension();
      assert.equal(ext.key, 'paysentry');
    });
  });

  describe('getSessionId', () => {
    it('returns configured session ID', () => {
      const adapter = new PaySentryX402Adapter(
        { policyEngine: engine, spendTracker: tracker },
        { sessionId: 'test-session' },
      );
      assert.equal(adapter.getSessionId(), 'test-session');
    });
  });
});
