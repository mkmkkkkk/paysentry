import type { PolicyRule, PolicyAction, PaymentProtocol } from '@paysentry/core';
/**
 * Builder for creating policy rules with a fluent API.
 *
 * @example
 * ```ts
 * const rule = RuleBuilder.create('block-large-payments')
 *   .name('Block Large Payments')
 *   .maxAmount(1000)
 *   .currency('USDC')
 *   .action('deny')
 *   .build();
 * ```
 */
export declare class RuleBuilder {
    private _id;
    private _name;
    private _description?;
    private _enabled;
    private _priority;
    private _action;
    private _conditions;
    private constructor();
    /** Create a new rule builder with the given ID */
    static create(id?: string): RuleBuilder;
    /** Set the rule name */
    name(name: string): this;
    /** Set the rule description */
    description(desc: string): this;
    /** Set whether the rule is enabled */
    enabled(enabled: boolean): this;
    /** Set the rule priority (lower = evaluated first) */
    priority(priority: number): this;
    /** Set the action to take when rule matches */
    action(action: PolicyAction): this;
    /** Match specific agents (glob patterns) */
    agents(...patterns: string[]): this;
    /** Match specific recipients (glob patterns) */
    recipients(...patterns: string[]): this;
    /** Match specific services */
    services(...services: string[]): this;
    /** Match specific protocols */
    protocols(...protocols: PaymentProtocol[]): this;
    /** Set minimum amount threshold */
    minAmount(amount: number): this;
    /** Set maximum amount threshold */
    maxAmount(amount: number): this;
    /** Match specific currencies */
    currencies(...currencies: string[]): this;
    /** Match metadata key-value pairs */
    metadata(meta: Record<string, unknown>): this;
    /** Build the final PolicyRule object */
    build(): PolicyRule;
}
/**
 * Create a rule that blocks all transactions above a certain amount.
 */
export declare function blockAbove(amount: number, currency: string): PolicyRule;
/**
 * Create a rule that requires approval for transactions above a threshold.
 */
export declare function requireApprovalAbove(amount: number, currency: string): PolicyRule;
/**
 * Create a rule that blocks a specific recipient.
 */
export declare function blockRecipient(pattern: string): PolicyRule;
/**
 * Create a rule that only allows payments to specific recipients.
 */
export declare function allowOnlyRecipients(...patterns: string[]): PolicyRule;
/**
 * Create a catch-all deny rule (use as the last rule in a policy).
 */
export declare function denyAll(): PolicyRule;
/**
 * Create a catch-all allow rule (use as the last rule in a policy).
 */
export declare function allowAll(): PolicyRule;
//# sourceMappingURL=rules.d.ts.map