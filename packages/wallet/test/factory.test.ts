import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentTransaction } from '@paysentry/core';
import { createWallet, presets, PaySentryWallet } from '../src/index.js';
import type {
  WalletAdapter,
  WalletBalance,
  TransactionReceipt,
  TransactionStatus,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Mock WalletAdapter for factory tests
// ---------------------------------------------------------------------------

function mockAdapter(balance: number = 1000): WalletAdapter {
  let txCount = 0;
  return {
    name: 'mock',
    async getBalance(currency: string): Promise<WalletBalance> {
      return {
        currency,
        amount: balance.toFixed(2),
        rawAmount: (balance * 1_000_000).toString(),
        decimals: 6,
      };
    },
    async signAndSend(tx: AgentTransaction): Promise<TransactionReceipt> {
      txCount++;
      balance -= tx.amount;
      return {
        txHash: `0xmock_${txCount}`,
        network: 'base',
        confirmed: true,
        submittedAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      };
    },
    async getTransactionStatus(_txHash: string): Promise<TransactionStatus> {
      return { state: 'confirmed', confirmations: 10 };
    },
    async getAddresses(): Promise<string[]> {
      return ['0xMock'];
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWallet', () => {
  it('returns a PaySentryWallet instance', () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
    });

    assert.ok(wallet instanceof PaySentryWallet);
    assert.equal(wallet.walletName, 'mock');
  });

  it('works with zero config (no limits)', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
    });

    const result = await wallet.pay(10, '0xRecipient', 'test');

    assert.equal(result.status, 'completed');
    assert.ok(result.txHash);
  });

  it('enforces perTx limit from limits config', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
      limits: { perTx: 50 },
    });

    // Under limit — should pass
    const ok = await wallet.pay(30, '0xRecipient', 'small');
    assert.equal(ok.status, 'completed');

    // Over limit — should be denied
    const denied = await wallet.pay(100, '0xRecipient', 'too big');
    assert.equal(denied.status, 'denied');
  });

  it('enforces daily budget from limits config', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter(10000) },
      limits: { daily: 100, perTx: 50 },
    });

    // Spend 90 (9 x 10)
    for (let i = 0; i < 9; i++) {
      const r = await wallet.pay(10, '0xRecipient', `tx ${i}`);
      assert.equal(r.status, 'completed', `tx ${i} should pass`);
    }

    // This would push to 110, over daily 100
    const denied = await wallet.pay(20, '0xRecipient', 'over budget');
    assert.equal(denied.status, 'denied');
  });

  it('uses presets.standard correctly', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
      limits: presets.standard,
    });

    // standard: perTx=100, daily=500, requireApprovalAbove=50
    // Under approval threshold — should pass
    const ok = await wallet.pay(30, '0xRecipient', 'small');
    assert.equal(ok.status, 'completed');

    // Above approval threshold, no handler — should be denied
    const needsApproval = await wallet.pay(80, '0xRecipient', 'needs approval');
    assert.equal(needsApproval.status, 'denied');
    assert.equal(needsApproval.policyAction, 'require_approval');

    // Over perTx limit — should be hard denied
    const overLimit = await wallet.pay(200, '0xRecipient', 'too much');
    assert.equal(overLimit.status, 'denied');
    assert.equal(overLimit.policyAction, 'deny');
  });

  it('uses presets.standard with approval handler', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
      limits: presets.standard,
      approvalHandler: async () => true, // auto-approve
    });

    // Above approval threshold — should pass because handler approves
    const ok = await wallet.pay(80, '0xRecipient', 'approved');
    assert.equal(ok.status, 'completed');
  });

  it('uses presets.conservative', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
      limits: presets.conservative,
    });

    // conservative: perTx=25, daily=100
    const ok = await wallet.pay(20, '0xRecipient', 'ok');
    assert.equal(ok.status, 'completed');

    const denied = await wallet.pay(30, '0xRecipient', 'too much');
    assert.equal(denied.status, 'denied');
  });

  it('passes agentId through', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
      agentId: 'my-agent',
    });

    await wallet.pay(10, '0xRecipient', 'test');

    const txs = wallet.spendTracker.getByAgent('my-agent' as import('@paysentry/core').AgentId);
    assert.equal(txs.length, 1);
    assert.equal(txs[0]!.agentId, 'my-agent');
  });

  it('.pay() shorthand uses default currency', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter() },
    });

    const result = await wallet.pay(10, '0xRecipient');

    assert.equal(result.status, 'completed');
  });

  it('presets.unlimited allows any amount', async () => {
    const wallet = createWallet({
      adapter: { type: 'custom', instance: mockAdapter(1_000_000) },
      limits: presets.unlimited,
    });

    const result = await wallet.pay(999_999, '0xRecipient', 'big');
    assert.equal(result.status, 'completed');
  });
});

describe('presets', () => {
  it('has expected presets defined', () => {
    assert.ok(presets.conservative);
    assert.ok(presets.standard);
    assert.ok(presets.generous);
    assert.ok(presets.unlimited);
  });

  it('conservative has correct values', () => {
    assert.equal(presets.conservative.perTx, 25);
    assert.equal(presets.conservative.daily, 100);
  });

  it('standard has approval threshold', () => {
    assert.equal(presets.standard.requireApprovalAbove, 50);
  });
});
