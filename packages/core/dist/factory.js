// =============================================================================
// Transaction Factory
// Convenience function for creating well-formed AgentTransaction objects
// =============================================================================
import { generateTransactionId } from './utils.js';
/**
 * Create a new AgentTransaction with auto-generated ID, timestamps, and default status.
 *
 * @param input - Transaction parameters
 * @returns A fully-formed AgentTransaction in 'pending' status
 *
 * @example
 * ```ts
 * const tx = createTransaction({
 *   agentId: 'agent-1' as AgentId,
 *   recipient: 'https://api.openai.com/v1/chat',
 *   amount: 0.02,
 *   currency: 'USDC',
 *   purpose: 'GPT-4 API call',
 *   protocol: 'x402',
 * });
 * ```
 */
export function createTransaction(input) {
    const now = new Date().toISOString();
    return {
        id: generateTransactionId(),
        agentId: input.agentId,
        recipient: input.recipient,
        amount: input.amount,
        currency: input.currency,
        purpose: input.purpose,
        protocol: input.protocol,
        status: 'pending',
        service: input.service,
        createdAt: now,
        updatedAt: now,
        metadata: Object.freeze(input.metadata ?? {}),
    };
}
//# sourceMappingURL=factory.js.map