import type { AgentTransaction, PaymentProtocol, PolicyEvaluation, ApprovalHandler, Logger } from '@paysentry/core';
import type { PolicyEngine } from './policy.js';
/** Minimal HTTP request interface (framework-agnostic) */
export interface MiddlewareRequest {
    readonly body: Record<string, unknown>;
    readonly headers: Record<string, string | string[] | undefined>;
    readonly method: string;
    readonly url: string;
}
/** Minimal HTTP response interface (framework-agnostic) */
export interface MiddlewareResponse {
    status(code: number): MiddlewareResponse;
    json(data: unknown): void;
}
/** Next function for middleware chaining */
export type NextFunction = (err?: unknown) => void;
/** Configuration for the policy middleware */
export interface PolicyMiddlewareConfig {
    /** The policy engine to enforce */
    readonly engine: PolicyEngine;
    /** Optional approval handler for transactions requiring approval */
    readonly approvalHandler?: ApprovalHandler;
    /** Optional logger */
    readonly logger?: Logger;
    /**
     * Extract transaction details from the request.
     * If not provided, expects the request body to contain
     * { agentId, recipient, amount, currency, purpose, protocol }.
     */
    readonly extractTransaction?: (req: MiddlewareRequest) => TransactionInput | null;
}
/** Input for creating a transaction from an HTTP request */
export interface TransactionInput {
    readonly agentId: string;
    readonly recipient: string;
    readonly amount: number;
    readonly currency: string;
    readonly purpose: string;
    readonly protocol: PaymentProtocol;
    readonly service?: string;
    readonly metadata?: Record<string, unknown>;
}
/**
 * Create an HTTP middleware that enforces spend policies on incoming
 * payment requests. Blocks, flags, or requires approval before the
 * request reaches the actual payment handler.
 *
 * @example
 * ```ts
 * // Express
 * import express from 'express';
 * const app = express();
 *
 * app.use('/pay', createPolicyMiddleware({
 *   engine: policyEngine,
 *   approvalHandler: async (tx) => {
 *     // Slack notification, email, etc.
 *     return true; // or false to reject
 *   },
 * }));
 *
 * app.post('/pay', (req, res) => {
 *   // If we reach here, the policy engine approved the transaction
 *   const evaluation = (req as any).policyEvaluation;
 *   // ... execute payment
 * });
 * ```
 */
export declare function createPolicyMiddleware(config: PolicyMiddlewareConfig): (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => Promise<void>;
/**
 * Helper: Extract the PolicyEvaluation from a request that passed through
 * the policy middleware.
 */
export declare function getPolicyEvaluation(req: MiddlewareRequest): PolicyEvaluation | undefined;
/**
 * Helper: Extract the AgentTransaction from a request that passed through
 * the policy middleware.
 */
export declare function getAgentTransaction(req: MiddlewareRequest): AgentTransaction | undefined;
//# sourceMappingURL=middleware.d.ts.map