// =============================================================================
// TransactionMapper — Maps x402 payment data to PaySentry AgentTransaction
// Pure functions with no side effects. The bridge between two type systems.
// =============================================================================

import type {
  AgentId,
  AgentTransaction,
} from '@paysentry/core';
import { createTransaction } from '@paysentry/core';
import type {
  X402PaymentPayload,
  X402PaymentRequirements,
  X402PaySentryConfig,
} from './types.js';

/**
 * Extract an AgentId from an x402 payment payload.
 *
 * Resolution order:
 * 1. Custom `resolveAgentId` function from config (if provided)
 * 2. Payer address from the payment payload (if decodable)
 * 3. `defaultAgentId` from config
 * 4. Fallback: `'unknown-agent'`
 *
 * @param payload - The x402 payment payload
 * @param config - PaySentry x402 config
 * @returns Resolved AgentId
 */
export async function extractAgent(
  payload: X402PaymentPayload,
  config: X402PaySentryConfig,
): Promise<AgentId> {
  // Try to extract payer from payload (scheme-dependent, stored in payload string)
  const payerAddress = extractPayerAddress(payload);

  if (payerAddress && config.resolveAgentId) {
    try {
      return await config.resolveAgentId(payerAddress);
    } catch {
      config.logger?.warn(
        `[TransactionMapper] resolveAgentId failed for "${payerAddress}", using fallback`,
      );
    }
  }

  if (payerAddress) {
    return payerAddress as AgentId;
  }

  return (config.defaultAgentId ?? ('unknown-agent' as AgentId));
}

/**
 * Extract the payment amount from x402 payment requirements.
 *
 * The `maxAmountRequired` in x402 is a string representing the amount
 * in the smallest unit of the token (e.g., wei for ETH, micro-units for USDC).
 * This function converts it to a human-readable decimal number.
 *
 * @param requirements - The x402 payment requirements
 * @returns Amount as a number (in standard units, not smallest unit)
 */
export function extractAmount(requirements: X402PaymentRequirements): number {
  const raw = requirements.maxAmountRequired;
  if (!raw) return 0;

  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    return 0;
  }

  // x402 amounts are typically in base units (e.g., USDC has 6 decimals)
  // For USDC-like tokens, divide by 1e6. For ETH-like, divide by 1e18.
  // For Nano (XNO), divide by 1e30 (raw is the smallest unit).
  // Default to 6 decimals (USDC) as that's the most common x402 use case.
  const decimals = inferDecimals(requirements.scheme, requirements.network);
  return parsed / Math.pow(10, decimals);
}

/**
 * Extract the recipient address from x402 payment requirements.
 *
 * @param requirements - The x402 payment requirements
 * @returns Recipient address string
 */
export function extractRecipient(requirements: X402PaymentRequirements): string {
  return requirements.payTo ?? 'unknown-recipient';
}

/**
 * Map x402 payment data to a full PaySentry AgentTransaction.
 *
 * This is the primary mapping function used by the adapter.
 * It composes `extractAgent`, `extractAmount`, and `extractRecipient`
 * to produce a well-formed `AgentTransaction`.
 *
 * @param payload - The x402 payment payload
 * @param requirements - The x402 payment requirements
 * @param config - PaySentry x402 config
 * @returns A pending AgentTransaction
 */
export async function mapToTransaction(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
  config: X402PaySentryConfig,
): Promise<AgentTransaction> {
  const agentId = await extractAgent(payload, config);
  const amount = extractAmount(requirements);
  const recipient = extractRecipient(requirements);
  const currency = config.defaultCurrency ?? inferCurrency(requirements.scheme, requirements.network) ?? 'USDC';

  return createTransaction({
    agentId,
    recipient,
    amount,
    currency,
    purpose: requirements.description ?? `x402 payment to ${recipient}`,
    protocol: 'x402',
    metadata: {
      x402Version: payload.x402Version,
      scheme: payload.scheme ?? requirements.scheme,
      network: payload.network ?? requirements.network,
      resource: payload.resource ?? requirements.resource,
      maxAmountRequired: requirements.maxAmountRequired,
    },
  });
}

/**
 * Generate a deterministic-ish transaction key from x402 payment data.
 * Useful for deduplication and context lookups.
 *
 * @param payload - The x402 payment payload
 * @param requirements - The x402 payment requirements
 * @returns A string key
 */
export function transactionKey(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements,
): string {
  const payer = extractPayerAddress(payload) ?? 'unknown';
  const payTo = requirements.payTo ?? 'unknown';
  const amount = requirements.maxAmountRequired ?? '0';
  return `x402:${payer}:${payTo}:${amount}`;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to extract a payer address from the x402 payment payload.
 * The payload structure varies by scheme; this handles common cases.
 */
function extractPayerAddress(payload: X402PaymentPayload): string | undefined {
  // Some x402 payloads include a top-level 'payer' or 'from' field
  if (typeof payload.payer === 'string' && payload.payer) {
    return payload.payer;
  }
  if (typeof payload.from === 'string' && payload.from) {
    return payload.from;
  }

  // Fallback: cannot extract payer from opaque payload string
  return undefined;
}

/**
 * Infer decimal places from the payment scheme and network.
 * Defaults to 6 (USDC convention).
 *
 * Network takes precedence over scheme because the scheme can be shared
 * across networks (e.g. x402 `exact` is used for both USDC and Nano).
 */
function inferDecimals(scheme: string, network?: string): number {
  const normalizedScheme = scheme?.toLowerCase() ?? '';
  const normalizedNetwork = network?.toLowerCase() ?? '';

  // Nano (XNO) uses raw as its smallest unit (1 nano = 10^30 raw).
  // A `nano:mainnet` (CAIP-2) network identifies it regardless of scheme.
  if (
    normalizedNetwork.includes('nano') ||
    normalizedScheme.includes('nano') ||
    normalizedScheme.includes('xno')
  ) {
    return 30;
  }
  if (normalizedScheme.includes('eth') || normalizedScheme.includes('ether')) {
    return 18;
  }
  // USDC, USDT, and most stablecoins use 6 decimals
  return 6;
}

/**
 * Infer currency symbol from the payment scheme and network.
 */
function inferCurrency(scheme: string, network?: string): string | undefined {
  const normalizedScheme = scheme?.toLowerCase() ?? '';
  const normalizedNetwork = network?.toLowerCase() ?? '';

  // Nano (XNO) is identified by its CAIP-2 network (nano:mainnet) or asset name.
  if (
    normalizedNetwork.includes('nano') ||
    normalizedScheme.includes('nano') ||
    normalizedScheme.includes('xno')
  ) {
    return 'XNO';
  }
  if (normalizedScheme.includes('usdc')) return 'USDC';
  if (normalizedScheme.includes('usdt')) return 'USDT';
  if (normalizedScheme.includes('eth') || normalizedScheme.includes('ether')) return 'ETH';
  if (normalizedScheme.includes('dai')) return 'DAI';
  return undefined;
}
