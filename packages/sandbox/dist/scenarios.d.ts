import type { TestScenario } from '@paysentry/core';
/**
 * Basic happy path: A single successful payment.
 */
export declare const SCENARIO_BASIC_PAYMENT: TestScenario;
/**
 * Budget overspend: Agent tries to exceed its daily budget.
 */
export declare const SCENARIO_OVERSPEND: TestScenario;
/**
 * Large transaction requiring approval.
 */
export declare const SCENARIO_APPROVAL_REQUIRED: TestScenario;
/**
 * Blocked recipient: Agent tries to pay a blacklisted service.
 */
export declare const SCENARIO_BLOCKED_RECIPIENT: TestScenario;
/**
 * Multi-protocol: Agent uses different protocols for different services.
 */
export declare const SCENARIO_MULTI_PROTOCOL: TestScenario;
/**
 * Dispute flow: Payment succeeds, then a dispute is filed.
 */
export declare const SCENARIO_DISPUTE: TestScenario;
/**
 * Rate spike: Rapid succession of payments triggers rate limiting.
 */
export declare const SCENARIO_RATE_SPIKE: TestScenario;
/**
 * Timeout scenario: Payment to a slow endpoint that times out.
 */
export declare const SCENARIO_TIMEOUT: TestScenario;
/**
 * Multi-agent: Multiple agents making concurrent payments.
 */
export declare const SCENARIO_MULTI_AGENT: TestScenario;
/** All built-in scenarios */
export declare const ALL_SCENARIOS: readonly TestScenario[];
//# sourceMappingURL=scenarios.d.ts.map