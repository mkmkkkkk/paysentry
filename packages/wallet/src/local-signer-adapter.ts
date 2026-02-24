// =============================================================================
// LocalSignerAdapter — WalletAdapter for local encrypted keystores
//
// Unlike Conway's plaintext key storage, this adapter:
// 1. Reads keys from an AES-256-GCM encrypted keystore file
// 2. Decrypts only when signing (key never persists in memory)
// 3. Signs transactions locally and broadcasts via RPC
//
// This is the "self-custody" option — you own the keys, PaySentry owns the rules.
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { AgentTransaction, Logger } from '@paysentry/core';
import type {
  WalletAdapter,
  WalletBalance,
  TransactionReceipt,
  TransactionStatus,
  LocalSignerAdapterConfig,
} from './types.js';

/** Internal keystore file format */
interface EncryptedKeystore {
  readonly version: 1;
  readonly address: string;
  readonly crypto: {
    readonly cipher: 'aes-256-gcm';
    readonly kdf: 'scrypt';
    readonly kdfParams: {
      readonly salt: string;
      readonly n: number;
      readonly r: number;
      readonly p: number;
      readonly dkLen: number;
    };
    readonly ciphertext: string;
    readonly iv: string;
    readonly authTag: string;
  };
}

/**
 * LocalSignerAdapter manages a local encrypted keystore.
 * It provides the same WalletAdapter interface but with self-custody.
 *
 * Key security model:
 * - Private key is AES-256-GCM encrypted at rest
 * - scrypt KDF derives encryption key from passphrase
 * - Key is decrypted in memory only during signing, then zeroed
 * - PaySentry PolicyEngine gates all signAndSend calls
 *
 * @example
 * ```ts
 * // First time: create a keystore
 * LocalSignerAdapter.createKeystore(
 *   '/secure/path/keystore.json',
 *   '0xYOUR_PRIVATE_KEY_HEX',
 *   'your-strong-passphrase',
 * );
 *
 * // Then use it
 * const adapter = new LocalSignerAdapter({
 *   keystorePath: '/secure/path/keystore.json',
 *   passphrase: process.env.KEYSTORE_PASSPHRASE!,
 *   rpcUrl: 'https://mainnet.base.org',
 * });
 * ```
 */
export class LocalSignerAdapter implements WalletAdapter {
  readonly name = 'local';
  private readonly config: Required<Pick<LocalSignerAdapterConfig, 'network'>> &
    LocalSignerAdapterConfig;
  private readonly logger?: Logger;
  private readonly keystore: EncryptedKeystore;

  constructor(config: LocalSignerAdapterConfig) {
    this.config = {
      network: 'base',
      ...config,
    };
    this.logger = config.logger;

    if (!existsSync(config.keystorePath)) {
      throw new Error(
        `Keystore not found at ${config.keystorePath}. ` +
        `Use LocalSignerAdapter.createKeystore() to create one.`,
      );
    }

    const raw = readFileSync(config.keystorePath, 'utf-8');
    this.keystore = JSON.parse(raw) as EncryptedKeystore;

    if (this.keystore.version !== 1) {
      throw new Error(`Unsupported keystore version: ${this.keystore.version}`);
    }

    // Verify passphrase can decrypt (fail fast)
    try {
      const key = this.decryptPrivateKey();
      key.fill(0); // Zero out immediately
    } catch (err) {
      throw new Error(
        `Failed to decrypt keystore — wrong passphrase? ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger?.info('[LocalSigner] Keystore loaded and verified', {
      address: this.keystore.address,
    });
  }

  async getBalance(currency: string): Promise<WalletBalance> {
    if (currency.toUpperCase() === 'ETH') {
      const result = await this.rpcCall<string>('eth_getBalance', [this.keystore.address, 'latest']);
      const wei = BigInt(result);
      const ethAmount = Number(wei) / 1e18;
      return {
        currency: 'ETH',
        amount: ethAmount.toFixed(8),
        rawAmount: wei.toString(),
        decimals: 18,
      };
    }

    // ERC-20 token balance (USDC, etc.)
    // balanceOf(address) selector: 0x70a08231
    const paddedAddress = this.keystore.address.slice(2).padStart(64, '0');
    const data = `0x70a08231${paddedAddress}`;

    const tokenAddress = this.getTokenAddress(currency);
    if (!tokenAddress) {
      return { currency, amount: '0', rawAmount: '0', decimals: 6 };
    }

    const result = await this.rpcCall<string>('eth_call', [
      { to: tokenAddress, data },
      'latest',
    ]);

    const rawBalance = BigInt(result);
    const decimals = currency.toUpperCase() === 'USDC' ? 6 : 18;
    const amount = Number(rawBalance) / Math.pow(10, decimals);

    return {
      currency,
      amount: amount.toFixed(decimals),
      rawAmount: rawBalance.toString(),
      decimals,
    };
  }

  async signAndSend(tx: AgentTransaction): Promise<TransactionReceipt> {
    this.logger?.info(`[LocalSigner] Signing transaction ${tx.id}`, {
      amount: tx.amount,
      currency: tx.currency,
      recipient: tx.recipient,
    });

    // Decrypt key, use it, zero it
    const privateKey = this.decryptPrivateKey();

    try {
      // Build ERC-20 transfer calldata for USDC
      // transfer(address,uint256) selector: 0xa9059cbb
      const tokenAddress = this.getTokenAddress(tx.currency);
      if (!tokenAddress) {
        throw new Error(`Unsupported currency: ${tx.currency}`);
      }

      const decimals = tx.currency.toUpperCase() === 'USDC' ? 6 : 18;
      const rawAmount = BigInt(Math.round(tx.amount * Math.pow(10, decimals)));
      const paddedRecipient = tx.recipient.slice(2).padStart(64, '0');
      const paddedAmount = rawAmount.toString(16).padStart(64, '0');
      const data = `0xa9059cbb${paddedRecipient}${paddedAmount}`;

      // Get nonce
      const nonce = await this.rpcCall<string>('eth_getTransactionCount', [
        this.keystore.address,
        'pending',
      ]);

      // Get gas price
      const gasPrice = await this.rpcCall<string>('eth_gasPrice', []);

      // Estimate gas
      const gasEstimate = await this.rpcCall<string>('eth_estimateGas', [
        {
          from: this.keystore.address,
          to: tokenAddress,
          data,
        },
      ]);

      // Build raw transaction
      // NOTE: In production, use a proper EIP-1559 transaction builder
      // with ethers.js or viem. This is a simplified implementation
      // that shows the architecture — the actual signing uses the
      // decrypted key through the crypto library.
      const rawTx = {
        nonce,
        gasPrice,
        gasLimit: gasEstimate,
        to: tokenAddress,
        value: '0x0',
        data,
        chainId: this.getChainId(),
      };

      // Sign using eth_sendTransaction via the RPC with the private key
      // In a real implementation, you would use a library like ethers.js:
      //   const wallet = new ethers.Wallet(privateKey, provider);
      //   const txResponse = await wallet.sendTransaction(rawTx);
      //
      // For now, we use eth_signTransaction pattern:
      const txHash = await this.signAndBroadcast(rawTx, privateKey);

      const submittedAt = new Date().toISOString();

      return {
        txHash,
        network: this.config.network,
        confirmed: false, // Will need to poll for confirmation
        submittedAt,
      };
    } finally {
      // CRITICAL: Zero out the private key from memory
      privateKey.fill(0);
    }
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    try {
      const receipt = await this.rpcCall<{ status: string; blockNumber: string } | null>(
        'eth_getTransactionReceipt',
        [txHash],
      );

      if (!receipt) {
        // Check if tx is still in mempool
        const tx = await this.rpcCall<{ hash: string } | null>(
          'eth_getTransactionByHash',
          [txHash],
        );
        if (tx) {
          return { state: 'pending', confirmations: 0 };
        }
        return { state: 'not_found', confirmations: 0 };
      }

      const succeeded = receipt.status === '0x1';
      const blockNumber = parseInt(receipt.blockNumber, 16);

      // Get current block for confirmation count
      const currentBlock = await this.rpcCall<string>('eth_blockNumber', []);
      const currentBlockNum = parseInt(currentBlock, 16);
      const confirmations = currentBlockNum - blockNumber + 1;

      return {
        state: succeeded ? 'confirmed' : 'failed',
        confirmations,
        blockNumber,
        failureReason: succeeded ? undefined : 'Transaction reverted',
      };
    } catch {
      return { state: 'not_found', confirmations: 0 };
    }
  }

  async getAddresses(): Promise<string[]> {
    return [this.keystore.address];
  }

  // ---------------------------------------------------------------------------
  // Static: Keystore creation
  // ---------------------------------------------------------------------------

  /**
   * Create a new encrypted keystore file.
   * Call this once to set up the wallet.
   *
   * @param path - Where to save the keystore
   * @param privateKeyHex - The private key (0x-prefixed hex string)
   * @param passphrase - Passphrase for encryption
   */
  static createKeystore(
    path: string,
    privateKeyHex: string,
    passphrase: string,
  ): void {
    // Derive address from private key (keccak256 of public key)
    // Simplified: in production, use proper elliptic curve derivation
    const keyBytes = Buffer.from(
      privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex,
      'hex',
    );

    // Derive a deterministic address placeholder
    // In production, use secp256k1 to derive the actual Ethereum address
    const addressHash = createHash('sha256').update(keyBytes).digest('hex');
    const address = `0x${addressHash.slice(0, 40)}`;

    // Encrypt the private key
    const salt = randomBytes(32);
    const iv = randomBytes(16);
    const kdfParams = { salt: salt.toString('hex'), n: 262144, r: 8, p: 1, dkLen: 32 };

    const derivedKey = scryptSync(passphrase, salt, kdfParams.dkLen, {
      N: kdfParams.n,
      r: kdfParams.r,
      p: kdfParams.p,
    });

    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(keyBytes), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const keystore: EncryptedKeystore = {
      version: 1,
      address,
      crypto: {
        cipher: 'aes-256-gcm',
        kdf: 'scrypt',
        kdfParams,
        ciphertext: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      },
    };

    writeFileSync(path, JSON.stringify(keystore, null, 2));

    // Zero out key bytes
    keyBytes.fill(0);
  }

  // ---------------------------------------------------------------------------
  // Private: Decryption
  // ---------------------------------------------------------------------------

  private decryptPrivateKey(): Buffer {
    const { crypto } = this.keystore;
    const salt = Buffer.from(crypto.kdfParams.salt, 'hex');
    const iv = Buffer.from(crypto.iv, 'hex');
    const ciphertext = Buffer.from(crypto.ciphertext, 'hex');
    const authTag = Buffer.from(crypto.authTag, 'hex');

    const derivedKey = scryptSync(this.config.passphrase, salt, crypto.kdfParams.dkLen, {
      N: crypto.kdfParams.n,
      r: crypto.kdfParams.r,
      p: crypto.kdfParams.p,
    });

    const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  }

  // ---------------------------------------------------------------------------
  // Private: RPC and signing
  // ---------------------------------------------------------------------------

  private async rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });

    const json = (await response.json()) as { result?: unknown; error?: { message: string } };

    if (json.error) {
      throw new Error(`RPC error: ${json.error.message}`);
    }

    return json.result as T;
  }

  private async signAndBroadcast(
    rawTx: Record<string, unknown>,
    _privateKey: Buffer,
  ): Promise<string> {
    // NOTE: This is a stub. In production, you would:
    // 1. RLP-encode the transaction
    // 2. Sign with secp256k1 using the private key
    // 3. Broadcast via eth_sendRawTransaction
    //
    // Use ethers.js or viem for this:
    //   import { Wallet } from 'ethers';
    //   const wallet = new Wallet(privateKey);
    //   const signedTx = await wallet.signTransaction(rawTx);
    //   const result = await this.rpcCall('eth_sendRawTransaction', [signedTx]);
    //
    // For now, throw to indicate this needs a real signing library:
    throw new Error(
      'LocalSignerAdapter.signAndBroadcast requires ethers.js or viem for transaction signing. ' +
      'Install ethers: npm install ethers, then replace this stub with real signing logic. ' +
      'Transaction data prepared: ' + JSON.stringify({ to: rawTx.to, nonce: rawTx.nonce }),
    );
  }

  private getTokenAddress(currency: string): string | undefined {
    // Token contract addresses per network
    const tokens: Record<string, Record<string, string>> = {
      base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
      'base-sepolia': {
        USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      },
    };

    return tokens[this.config.network]?.[currency.toUpperCase()];
  }

  private getChainId(): number {
    const chains: Record<string, number> = {
      base: 8453,
      'base-sepolia': 84532,
      ethereum: 1,
    };
    return chains[this.config.network] ?? 8453;
  }
}
