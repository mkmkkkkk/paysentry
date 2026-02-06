// =============================================================================
// Middleware — HTTP middleware that enforces policies on agent payments
// Compatible with Express, Fastify, or any framework using (req, res, next)
// =============================================================================
import { createTransaction } from '@paysentry/core';
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
export function createPolicyMiddleware(config) {
    const { engine, approvalHandler, logger } = config;
    return async (req, res, next) => {
        try {
            // Extract transaction from request
            const input = config.extractTransaction
                ? config.extractTransaction(req)
                : extractDefaultTransaction(req);
            if (!input) {
                res.status(400).json({
                    error: 'Invalid request',
                    message: 'Could not extract transaction details from request body',
                });
                return;
            }
            // Create a proper transaction object
            const tx = createTransaction({
                agentId: input.agentId,
                recipient: input.recipient,
                amount: input.amount,
                currency: input.currency,
                purpose: input.purpose,
                protocol: input.protocol,
                service: input.service,
                metadata: input.metadata,
            });
            // Evaluate against policy engine
            const evaluation = engine.evaluate(tx);
            logger?.info(`[PolicyMiddleware] Evaluated transaction ${tx.id}: ${evaluation.action}`, {
                allowed: evaluation.allowed,
                rule: evaluation.triggeredRule?.name,
            });
            // Handle the evaluation result
            switch (evaluation.action) {
                case 'deny':
                    res.status(403).json({
                        error: 'Policy violation',
                        message: evaluation.reason,
                        details: evaluation.details,
                        transactionId: tx.id,
                    });
                    return;
                case 'require_approval': {
                    if (!approvalHandler) {
                        res.status(403).json({
                            error: 'Approval required',
                            message: `${evaluation.reason}. No approval handler configured.`,
                            transactionId: tx.id,
                        });
                        return;
                    }
                    const approved = await approvalHandler(tx);
                    if (!approved) {
                        res.status(403).json({
                            error: 'Approval denied',
                            message: 'Transaction was rejected by the approval handler',
                            transactionId: tx.id,
                        });
                        return;
                    }
                    logger?.info(`[PolicyMiddleware] Transaction ${tx.id} approved`);
                    break;
                }
                case 'flag':
                    logger?.warn(`[PolicyMiddleware] Transaction ${tx.id} flagged: ${evaluation.reason}`);
                    break;
                case 'allow':
                    break;
            }
            // Attach evaluation result and transaction to request for downstream handlers
            req['policyEvaluation'] = evaluation;
            req['agentTransaction'] = tx;
            next();
        }
        catch (err) {
            logger?.error(`[PolicyMiddleware] Error: ${err}`);
            next(err);
        }
    };
}
/**
 * Default transaction extractor — reads from request body.
 */
function extractDefaultTransaction(req) {
    const body = req.body;
    if (!body)
        return null;
    const agentId = body['agentId'];
    const recipient = body['recipient'];
    const amount = body['amount'];
    const currency = body['currency'];
    const purpose = body['purpose'];
    const protocol = body['protocol'];
    if (typeof agentId !== 'string' ||
        typeof recipient !== 'string' ||
        typeof amount !== 'number' ||
        typeof currency !== 'string' ||
        typeof purpose !== 'string' ||
        typeof protocol !== 'string') {
        return null;
    }
    return {
        agentId,
        recipient,
        amount,
        currency,
        purpose,
        protocol: protocol,
        service: typeof body['service'] === 'string' ? body['service'] : undefined,
        metadata: typeof body['metadata'] === 'object' && body['metadata'] !== null
            ? body['metadata']
            : undefined,
    };
}
/**
 * Helper: Extract the PolicyEvaluation from a request that passed through
 * the policy middleware.
 */
export function getPolicyEvaluation(req) {
    return req['policyEvaluation'];
}
/**
 * Helper: Extract the AgentTransaction from a request that passed through
 * the policy middleware.
 */
export function getAgentTransaction(req) {
    return req['agentTransaction'];
}
//# sourceMappingURL=middleware.js.map