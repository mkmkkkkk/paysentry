// =============================================================================
// Pre-built Test Scenarios
// Ready-to-use scenarios for testing common agent payment patterns
// =============================================================================
/**
 * Create a transaction template for use in test scenarios.
 * This is a helper to reduce boilerplate in scenario definitions.
 */
function tx(overrides) {
    return {
        agentId: (overrides.agentId ?? 'test-agent'),
        recipient: overrides.recipient ?? 'https://api.example.com/resource',
        amount: overrides.amount ?? 1.0,
        currency: overrides.currency ?? 'USDC',
        purpose: overrides.purpose ?? 'Test payment',
        protocol: overrides.protocol ?? 'x402',
        service: overrides.service,
        metadata: Object.freeze(overrides.metadata ?? {}),
    };
}
// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
/**
 * Basic happy path: A single successful payment.
 */
export const SCENARIO_BASIC_PAYMENT = {
    name: 'Basic Payment',
    description: 'A single agent makes a simple x402 payment that should succeed.',
    transactions: [
        tx({
            amount: 0.05,
            purpose: 'Basic API call',
            recipient: 'https://api.openai.com/v1/chat',
        }),
    ],
    expectedOutcomes: ['completed'],
};
/**
 * Budget overspend: Agent tries to exceed its daily budget.
 */
export const SCENARIO_OVERSPEND = {
    name: 'Budget Overspend',
    description: 'Agent makes multiple payments that cumulatively exceed the daily budget. The last transaction should be rejected.',
    transactions: [
        tx({ amount: 30, purpose: 'First batch of API calls' }),
        tx({ amount: 30, purpose: 'Second batch of API calls' }),
        tx({ amount: 30, purpose: 'Third batch of API calls' }),
        tx({ amount: 30, purpose: 'This should be rejected (exceeds $100 daily)' }),
    ],
    expectedOutcomes: ['completed', 'completed', 'completed', 'rejected'],
};
/**
 * Large transaction requiring approval.
 */
export const SCENARIO_APPROVAL_REQUIRED = {
    name: 'Approval Required',
    description: 'Agent attempts a payment above the auto-approve threshold. The transaction should require human approval.',
    transactions: [
        tx({
            amount: 500,
            purpose: 'Expensive model training run',
            recipient: 'https://compute.provider.com/train',
        }),
    ],
    expectedOutcomes: ['approved'],
};
/**
 * Blocked recipient: Agent tries to pay a blacklisted service.
 */
export const SCENARIO_BLOCKED_RECIPIENT = {
    name: 'Blocked Recipient',
    description: 'Agent attempts to pay a recipient that is on the blocklist. Should be denied.',
    transactions: [
        tx({
            recipient: 'https://malicious-service.com/api',
            amount: 1.0,
            purpose: 'Attempting to pay blocked recipient',
        }),
    ],
    expectedOutcomes: ['rejected'],
};
/**
 * Multi-protocol: Agent uses different protocols for different services.
 */
export const SCENARIO_MULTI_PROTOCOL = {
    name: 'Multi-Protocol',
    description: 'Agent makes payments across x402, ACP, and AP2 protocols. All should succeed.',
    transactions: [
        tx({
            protocol: 'x402',
            recipient: 'https://api.service-a.com/v1/data',
            amount: 0.10,
            purpose: 'x402 API payment',
        }),
        tx({
            protocol: 'acp',
            recipient: 'merchant:coffee-shop',
            amount: 5.50,
            purpose: 'ACP merchant payment',
        }),
        tx({
            protocol: 'ap2',
            recipient: 'agent://research-agent',
            amount: 2.00,
            purpose: 'AP2 agent-to-agent payment',
        }),
    ],
    expectedOutcomes: ['completed', 'completed', 'completed'],
};
/**
 * Dispute flow: Payment succeeds, then a dispute is filed.
 */
export const SCENARIO_DISPUTE = {
    name: 'Dispute Flow',
    description: 'Agent makes a payment, but the service does not deliver. A dispute should be filed.',
    transactions: [
        tx({
            amount: 25.0,
            purpose: 'Purchase premium dataset',
            recipient: 'https://data-provider.com/datasets/premium',
            metadata: { expectedDelivery: 'immediate', category: 'data' },
        }),
    ],
    expectedOutcomes: ['disputed'],
};
/**
 * Rate spike: Rapid succession of payments triggers rate limiting.
 */
export const SCENARIO_RATE_SPIKE = {
    name: 'Rate Spike',
    description: 'Agent fires 10 rapid payments in succession. Should trigger rate spike alerts.',
    transactions: Array.from({ length: 10 }, (_, i) => tx({
        amount: 0.01,
        purpose: `Rapid payment ${i + 1}`,
    })),
    expectedOutcomes: Array.from({ length: 10 }, () => 'completed'),
};
/**
 * Timeout scenario: Payment to a slow endpoint that times out.
 */
export const SCENARIO_TIMEOUT = {
    name: 'Timeout',
    description: 'Agent pays a service that takes too long to respond. Should fail with timeout.',
    transactions: [
        tx({
            amount: 1.0,
            purpose: 'Payment to slow service',
            recipient: 'https://slow-service.example.com/api',
            metadata: { timeout: 5000 },
        }),
    ],
    expectedOutcomes: ['failed'],
};
/**
 * Multi-agent: Multiple agents making concurrent payments.
 */
export const SCENARIO_MULTI_AGENT = {
    name: 'Multi-Agent',
    description: 'Three different agents each make a payment. All should succeed independently.',
    transactions: [
        tx({ agentId: 'agent-alpha', amount: 10, purpose: 'Agent Alpha payment' }),
        tx({ agentId: 'agent-beta', amount: 20, purpose: 'Agent Beta payment' }),
        tx({ agentId: 'agent-gamma', amount: 30, purpose: 'Agent Gamma payment' }),
    ],
    expectedOutcomes: ['completed', 'completed', 'completed'],
};
/** All built-in scenarios */
export const ALL_SCENARIOS = [
    SCENARIO_BASIC_PAYMENT,
    SCENARIO_OVERSPEND,
    SCENARIO_APPROVAL_REQUIRED,
    SCENARIO_BLOCKED_RECIPIENT,
    SCENARIO_MULTI_PROTOCOL,
    SCENARIO_DISPUTE,
    SCENARIO_RATE_SPIKE,
    SCENARIO_TIMEOUT,
    SCENARIO_MULTI_AGENT,
];
//# sourceMappingURL=scenarios.js.map