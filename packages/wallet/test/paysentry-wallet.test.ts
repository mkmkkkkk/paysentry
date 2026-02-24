import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '@paysentry/control';
import { blockAbove, requireApprovalAbove, allowAll } from '@paysentry/control';
import { SpendTracker } from '@paysentry/observe';
import { createTransaction } from '@paysentry/core';
import type { AgentId, PolicyId, AgentTransaction } from '@paysentry/core';
import { PaySentryWallet } from '../src/paysentry-wallet.js';
import type {
  WalletAdapter,
  WalletBalance,
  TransactionReceipt,
  TransactionStatus,
  PaymentRequest,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Mock WalletAdapter
// ---------------------------------------------------------------------------

class MockWalletAdapter implements WalletAdapter {
  readonly name = 'mock';
  balance: number = 1000;
  lastTx: AgentTransaction | null = null;
  shouldFail: boolean = false;
  failMessage: string = 'Mock failure';
  txCount: number = 0;

  async getBalance(currency: string): Promise<WalletBalance> {
    return {
      currency,
      amount: this.balance.toFixed(2),
      rawAmount: (this.balance * 1_000_000).toString(),
      decimals: 6,
    };
  }

  async signAndSend(tx: AgentTransaction): Promise<TransactionReceipt> {
    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }
    this.lastTx = tx;
    this.txCount++;
    this.balance -= tx.amount;
    return {
      txHash: `0xmock_${this.txCount}_${Date.now().toString(16)}`,
      network: 'base',
      confirmed: true,
      submittedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };
  }

  async getTransactionStatus(_txHash: string): Promise<TransactionStatus> {
    return { state: 'confirmed', confirmations: 10, blockNumber: 12345 };
  }

  async getAddresses(): Promise<string[]> {
    return ['0xMockAddress123'];
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    amount: 10,
    currency: 'USDC',
    to: '0xRecipient',
    reason: 'test payment',
    ...overrides,
  };
}

function createPoliciedEngine(): PolicyEngine {
  const engine = new PolicyEngine();
  engine.loadPolicy({
    id: 'default' as PolicyId,
    name: 'Default',
    enabled: true,
    rules: [
      blockAbove(1000, 'USDC'),
      requireApprovalAbove(100, 'USDC'),
      allowAll(),
    ],
    budgets: [
      { window: 'daily', maxAmount: 500, currency: 'USDC' },
    ],
  });
  return engine;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaySentryWallet', () => {
  let policyEngine: PolicyEngine;
  let mockWallet: MockWalletAdapter;
  let tracker: SpendTracker;
  let psWallet: PaySentryWallet;

  beforeEach(() => {
    policyEngine = createPoliciedEngine();
    mockWallet = new MockWalletAdapter();
    tracker = new SpendTracker();
    psWallet = new PaySentryWallet(
      {
        policyEngine,
        walletAdapter: mockWallet,
        spendTracker: tracker,
      },
      { defaultAgentId: 'test-agent' as AgentId },
    );
  });

  describe('executePayment — happy path', () => {
    it('executes a small payment successfully', async () => {
      const result = await psWallet.executePayment(makeRequest({ amount: 10 }));

      assert.equal(result.status, 'completed');
      assert.ok(result.txHash);
      assert.equal(result.network, 'base');
      assert.ok(result.transactionId);
      assert.equal(result.policyAction, 'allow');
    });

    it('records transaction in SpendTracker', async () => {
      await psWallet.executePayment(makeRequest({ amount: 25 }));

      assert.equal(tracker.size, 1);
      const txs = tracker.getByAgent('test-agent' as AgentId);
      assert.equal(txs.length, 1);
      assert.equal(txs[0]!.amount, 25);
      assert.equal(txs[0]!.status, 'completed');
    });

    it('passes agent transaction to wallet adapter', async () => {
      await psWallet.executePayment(makeRequest({
        amount: 42,
        to: '0xSpecificRecipient',
        reason: 'API credits',
      }));

      assert.ok(mockWallet.lastTx);
      assert.equal(mockWallet.lastTx.amount, 42);
      assert.equal(mockWallet.lastTx.recipient, '0xSpecificRecipient');
      assert.equal(mockWallet.lastTx.purpose, 'API credits');
    });
  });

  describe('executePayment — policy denial', () => {
    it('denies transactions above hard limit', async () => {
      // Set high balance so balance pre-check doesn't interfere
      mockWallet.balance = 10000;

      const result = await psWallet.executePayment(makeRequest({ amount: 1500 }));

      assert.equal(result.status, 'denied');
      assert.equal(result.policyAction, 'deny');
      // Wallet should NOT have been called
      assert.equal(mockWallet.txCount, 0);
    });

    it('records denied transactions in tracker', async () => {
      mockWallet.balance = 10000;
      await psWallet.executePayment(makeRequest({ amount: 1500 }));

      assert.equal(tracker.size, 1);
      const txs = tracker.getByAgent('test-agent' as AgentId);
      assert.equal(txs[0]!.status, 'rejected');
    });
  });

  describe('executePayment — approval flow', () => {
    it('denies when no approval handler is configured', async () => {
      const result = await psWallet.executePayment(makeRequest({ amount: 200 }));

      assert.equal(result.status, 'denied');
      assert.equal(result.policyAction, 'require_approval');
      assert.equal(mockWallet.txCount, 0);
    });

    it('proceeds when approval handler approves', async () => {
      psWallet = new PaySentryWallet(
        {
          policyEngine,
          walletAdapter: mockWallet,
          spendTracker: tracker,
        },
        {
          defaultAgentId: 'test-agent' as AgentId,
          approvalHandler: async () => true,
        },
      );

      const result = await psWallet.executePayment(makeRequest({ amount: 200 }));

      assert.equal(result.status, 'completed');
      assert.ok(result.txHash);
      assert.equal(mockWallet.txCount, 1);
    });

    it('denies when approval handler rejects', async () => {
      psWallet = new PaySentryWallet(
        {
          policyEngine,
          walletAdapter: mockWallet,
          spendTracker: tracker,
        },
        {
          defaultAgentId: 'test-agent' as AgentId,
          approvalHandler: async () => false,
        },
      );

      const result = await psWallet.executePayment(makeRequest({ amount: 200 }));

      assert.equal(result.status, 'denied');
      assert.equal(mockWallet.txCount, 0);
    });

    it('times out when approval takes too long', async () => {
      psWallet = new PaySentryWallet(
        {
          policyEngine,
          walletAdapter: mockWallet,
          spendTracker: tracker,
        },
        {
          defaultAgentId: 'test-agent' as AgentId,
          approvalHandler: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return true;
          },
          approvalTimeoutMs: 100, // 100ms timeout
        },
      );

      const result = await psWallet.executePayment(makeRequest({ amount: 200 }));

      assert.equal(result.status, 'approval_timeout');
      assert.equal(mockWallet.txCount, 0);
    });
  });

  describe('executePayment — budget enforcement', () => {
    it('denies when daily budget exceeded', async () => {
      // Execute payments totaling 490 USDC (under 500 limit)
      for (let i = 0; i < 49; i++) {
        const result = await psWallet.executePayment(makeRequest({ amount: 10 }));
        assert.equal(result.status, 'completed', `Payment ${i + 1} should succeed`);
      }

      // This should push us over the 500 daily budget
      const result = await psWallet.executePayment(makeRequest({ amount: 20 }));
      assert.equal(result.status, 'denied');
      assert.ok(result.reason.toLowerCase().includes('budget'));
    });
  });

  describe('executePayment — insufficient balance', () => {
    it('denies when balance is too low', async () => {
      mockWallet.balance = 5;

      const result = await psWallet.executePayment(makeRequest({ amount: 10 }));

      assert.equal(result.status, 'denied');
      assert.ok(result.reason.includes('Insufficient balance'));
      assert.equal(mockWallet.txCount, 0);
    });

    it('proceeds when balance check is disabled', async () => {
      mockWallet.balance = 5;

      psWallet = new PaySentryWallet(
        {
          policyEngine,
          walletAdapter: mockWallet,
          spendTracker: tracker,
        },
        {
          defaultAgentId: 'test-agent' as AgentId,
          preCheckBalance: false,
        },
      );

      const result = await psWallet.executePayment(makeRequest({ amount: 10 }));

      // Goes through policy, hits wallet (which doesn't check balance in mock)
      assert.equal(result.status, 'completed');
    });
  });

  describe('executePayment — wallet failure', () => {
    it('returns failed status when wallet throws', async () => {
      mockWallet.shouldFail = true;
      mockWallet.failMessage = 'Network timeout';

      const result = await psWallet.executePayment(makeRequest({ amount: 10 }));

      assert.equal(result.status, 'failed');
      assert.ok(result.reason.includes('Network timeout'));
      assert.ok(result.transactionId);
    });

    it('records failed transactions in tracker', async () => {
      mockWallet.shouldFail = true;

      await psWallet.executePayment(makeRequest({ amount: 10 }));

      assert.equal(tracker.size, 1);
      const txs = tracker.getByAgent('test-agent' as AgentId);
      assert.equal(txs[0]!.status, 'failed');
    });
  });

  describe('getBalance', () => {
    it('returns wallet balance', async () => {
      mockWallet.balance = 142.5;

      const balance = await psWallet.getBalance('USDC');

      assert.equal(balance.currency, 'USDC');
      assert.equal(balance.amount, '142.50');
    });
  });

  describe('getAddresses', () => {
    it('returns wallet addresses', async () => {
      const addresses = await psWallet.getAddresses();

      assert.deepEqual(addresses, ['0xMockAddress123']);
    });
  });

  describe('walletName', () => {
    it('returns the adapter name', () => {
      assert.equal(psWallet.walletName, 'mock');
    });
  });

  describe('wallet-agnostic design', () => {
    it('works with any WalletAdapter implementation', async () => {
      // Create a completely custom adapter inline
      const customAdapter: WalletAdapter = {
        name: 'custom-hardware',
        getBalance: async (c) => ({ currency: c, amount: '999', rawAmount: '999000000', decimals: 6 }),
        signAndSend: async (tx) => ({
          txHash: `0xcustom_${tx.id}`,
          network: 'ethereum',
          confirmed: true,
          submittedAt: new Date().toISOString(),
        }),
        getTransactionStatus: async () => ({ state: 'confirmed', confirmations: 100 }),
        getAddresses: async () => ['0xHardwareWallet'],
      };

      const customWallet = new PaySentryWallet(
        {
          policyEngine,
          walletAdapter: customAdapter,
          spendTracker: tracker,
        },
        { defaultAgentId: 'test-agent' as AgentId },
      );

      const result = await customWallet.executePayment(makeRequest({ amount: 50 }));

      assert.equal(result.status, 'completed');
      assert.ok(result.txHash?.startsWith('0xcustom_'));
      assert.equal(result.network, 'ethereum');
      assert.equal(customWallet.walletName, 'custom-hardware');
    });
  });
});
