// =============================================================================
// CoinbaseAdapter — WalletAdapter implementation for Coinbase Agentic Wallets
//
// Uses Coinbase Developer Platform API for key custody.
// Private keys live in Coinbase's TEE infrastructure — never exposed to agents.
// =============================================================================

import type { AgentTransaction, Logger } from '@paysentry/core';
import type {
  WalletAdapter,
  WalletBalance,
  TransactionReceipt,
  TransactionStatus,
  CoinbaseAdapterConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Coinbase API response shapes (internal)
// ---------------------------------------------------------------------------

interface CoinbaseBalanceAsset {
  symbol: string;
  decimals?: number;
}

interface CoinbaseBalance {
  asset: CoinbaseBalanceAsset;
  amount: string;
  raw_amount?: string;
}

interface CoinbaseTransfer {
  id: string;
  status: string;
  transaction_hash?: string;
  block_number?: number;
  failure_reason?: string;
}

interface CoinbaseAddress {
  address: string;
}

/**
 * CoinbaseAdapter delegates signing to Coinbase Agentic Wallets.
 *
 * The agent (and PaySentry) never see the private key.
 * Coinbase manages key custody in a TEE (Trusted Execution Environment).
 *
 * @example
 * ```ts
 * const adapter = new CoinbaseAdapter({
 *   apiKey: process.env.COINBASE_API_KEY!,
 *   walletId: process.env.COINBASE_WALLET_ID!,
 *   network: 'base',
 * });
 *
 * const balance = await adapter.getBalance('USDC');
 * ```
 */
export class CoinbaseAdapter implements WalletAdapter {
  readonly name = 'coinbase';
  private readonly config: Required<
    Pick<CoinbaseAdapterConfig, 'network' | 'baseUrl' | 'timeoutMs'>
  > &
    CoinbaseAdapterConfig;
  private readonly logger?: Logger;

  constructor(config: CoinbaseAdapterConfig) {
    this.config = {
      network: 'base',
      baseUrl: 'https://api.developer.coinbase.com',
      timeoutMs: 30_000,
      ...config,
    };
    this.logger = config.logger;
  }

  async getBalance(currency: string): Promise<WalletBalance> {
    const response = await this.request<{ data: CoinbaseBalance[] }>(
      'GET',
      `/platform/v1/wallets/${this.config.walletId}/balances`,
    );

    const balances = response.data ?? [];
    const match = balances.find(
      (b) => b.asset.symbol.toUpperCase() === currency.toUpperCase(),
    );

    if (!match) {
      return {
        currency,
        amount: '0',
        rawAmount: '0',
        decimals: currency === 'USDC' ? 6 : 18,
      };
    }

    return {
      currency: match.asset.symbol,
      amount: match.amount,
      rawAmount: match.raw_amount ?? match.amount,
      decimals: match.asset.decimals ?? (currency === 'USDC' ? 6 : 18),
    };
  }

  async signAndSend(tx: AgentTransaction): Promise<TransactionReceipt> {
    this.logger?.info(`[CoinbaseAdapter] Submitting transaction ${tx.id}`, {
      amount: tx.amount,
      currency: tx.currency,
      recipient: tx.recipient,
    });

    const transfer = await this.request<CoinbaseTransfer>(
      'POST',
      `/platform/v1/wallets/${this.config.walletId}/transfers`,
      {
        amount: tx.amount.toString(),
        asset_id: tx.currency.toLowerCase(),
        destination: tx.recipient,
        network_id: this.config.network,
      },
    );

    const submittedAt = new Date().toISOString();

    // Poll for completion if not immediately confirmed
    if (transfer.status === 'pending' || transfer.status === 'broadcasted') {
      const confirmed = await this.waitForConfirmation(transfer.id);
      return {
        txHash: confirmed.transaction_hash ?? transfer.id,
        network: this.config.network,
        confirmed: confirmed.status === 'completed',
        blockNumber: confirmed.block_number,
        submittedAt,
        confirmedAt: confirmed.status === 'completed' ? new Date().toISOString() : undefined,
      };
    }

    return {
      txHash: transfer.transaction_hash ?? transfer.id,
      network: this.config.network,
      confirmed: transfer.status === 'completed',
      blockNumber: transfer.block_number,
      submittedAt,
      confirmedAt: transfer.status === 'completed' ? submittedAt : undefined,
    };
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const transfer = await this.request<CoinbaseTransfer>(
        'GET',
        `/platform/v1/wallets/${this.config.walletId}/transfers/${txHash}`,
      );

      const statusMap: Record<string, TransactionStatus['state']> = {
        pending: 'pending',
        broadcasted: 'pending',
        completed: 'confirmed',
        failed: 'failed',
      };

      return {
        state: statusMap[transfer.status] ?? 'pending',
        confirmations: transfer.status === 'completed' ? 1 : 0,
        blockNumber: transfer.block_number,
        failureReason: transfer.status === 'failed' ? transfer.failure_reason : undefined,
      };
    } catch {
      return { state: 'not_found', confirmations: 0 };
    }
  }

  async getAddresses(): Promise<string[]> {
    const response = await this.request<{ data: CoinbaseAddress[] }>(
      'GET',
      `/platform/v1/wallets/${this.config.walletId}/addresses`,
    );

    const addresses = response.data ?? [];
    return addresses.map((a) => a.address);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Coinbase API error ${response.status}: ${errorBody}`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async waitForConfirmation(
    transferId: string,
    maxWaitMs: number = 60_000,
  ): Promise<CoinbaseTransfer> {
    const startTime = Date.now();
    const pollIntervalMs = 2_000;

    while (Date.now() - startTime < maxWaitMs) {
      const transfer = await this.request<CoinbaseTransfer>(
        'GET',
        `/platform/v1/wallets/${this.config.walletId}/transfers/${transferId}`,
      );

      if (transfer.status === 'completed' || transfer.status === 'failed') {
        return transfer;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout — return last known state
    return this.request<CoinbaseTransfer>(
      'GET',
      `/platform/v1/wallets/${this.config.walletId}/transfers/${transferId}`,
    );
  }
}
