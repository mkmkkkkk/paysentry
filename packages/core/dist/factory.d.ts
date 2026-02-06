import type { AgentTransaction, AgentId, PaymentProtocol, ServiceId } from './types.js';
/**
 * Input for creating a new transaction (omits auto-generated fields).
 */
export interface CreateTransactionInput {
    /** The agent initiating the payment */
    readonly agentId: AgentId;
    /** Recipient address, URI, or service identifier */
    readonly recipient: string;
    /** Payment amount */
    readonly amount: number;
    /** Currency identifier */
    readonly currency: string;
    /** Human-readable purpose */
    readonly purpose: string;
    /** Payment protocol */
    readonly protocol: PaymentProtocol;
    /** Optional service identifier */
    readonly service?: ServiceId;
    /** Optional metadata */
    readonly metadata?: Record<string, unknown>;
}
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
export declare function createTransaction(input: CreateTransactionInput): AgentTransaction;
//# sourceMappingURL=factory.d.ts.map