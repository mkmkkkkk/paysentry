// =============================================================================
// Rule Types and Builders
// Declarative policy rule definitions with convenient builder functions
// =============================================================================
/** Counter for auto-generating rule IDs */
let ruleCounter = 0;
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
export class RuleBuilder {
    _id;
    _name = '';
    _description;
    _enabled = true;
    _priority = 100;
    _action = 'deny';
    _conditions = {};
    constructor(id) {
        this._id = id;
    }
    /** Create a new rule builder with the given ID */
    static create(id) {
        return new RuleBuilder(id ?? `rule_${++ruleCounter}`);
    }
    /** Set the rule name */
    name(name) {
        this._name = name;
        return this;
    }
    /** Set the rule description */
    description(desc) {
        this._description = desc;
        return this;
    }
    /** Set whether the rule is enabled */
    enabled(enabled) {
        this._enabled = enabled;
        return this;
    }
    /** Set the rule priority (lower = evaluated first) */
    priority(priority) {
        this._priority = priority;
        return this;
    }
    /** Set the action to take when rule matches */
    action(action) {
        this._action = action;
        return this;
    }
    /** Match specific agents (glob patterns) */
    agents(...patterns) {
        this._conditions.agents = patterns;
        return this;
    }
    /** Match specific recipients (glob patterns) */
    recipients(...patterns) {
        this._conditions.recipients = patterns;
        return this;
    }
    /** Match specific services */
    services(...services) {
        this._conditions.services = services;
        return this;
    }
    /** Match specific protocols */
    protocols(...protocols) {
        this._conditions.protocols = protocols;
        return this;
    }
    /** Set minimum amount threshold */
    minAmount(amount) {
        this._conditions.minAmount = amount;
        return this;
    }
    /** Set maximum amount threshold */
    maxAmount(amount) {
        this._conditions.maxAmount = amount;
        return this;
    }
    /** Match specific currencies */
    currencies(...currencies) {
        this._conditions.currencies = currencies;
        return this;
    }
    /** Match metadata key-value pairs */
    metadata(meta) {
        this._conditions.metadata = meta;
        return this;
    }
    /** Build the final PolicyRule object */
    build() {
        if (!this._name) {
            this._name = this._id;
        }
        return {
            id: this._id,
            name: this._name,
            description: this._description,
            enabled: this._enabled,
            priority: this._priority,
            conditions: this._conditions,
            action: this._action,
        };
    }
}
// ---------------------------------------------------------------------------
// Pre-built rule templates
// ---------------------------------------------------------------------------
/**
 * Create a rule that blocks all transactions above a certain amount.
 */
export function blockAbove(amount, currency) {
    return RuleBuilder.create(`block-above-${amount}-${currency}`)
        .name(`Block transactions above ${amount} ${currency}`)
        .minAmount(amount)
        .currencies(currency)
        .action('deny')
        .priority(10)
        .build();
}
/**
 * Create a rule that requires approval for transactions above a threshold.
 */
export function requireApprovalAbove(amount, currency) {
    return RuleBuilder.create(`approval-above-${amount}-${currency}`)
        .name(`Require approval above ${amount} ${currency}`)
        .minAmount(amount)
        .currencies(currency)
        .action('require_approval')
        .priority(20)
        .build();
}
/**
 * Create a rule that blocks a specific recipient.
 */
export function blockRecipient(pattern) {
    return RuleBuilder.create(`block-recipient-${pattern}`)
        .name(`Block recipient: ${pattern}`)
        .recipients(pattern)
        .action('deny')
        .priority(5)
        .build();
}
/**
 * Create a rule that only allows payments to specific recipients.
 */
export function allowOnlyRecipients(...patterns) {
    // This is an allowlist — it explicitly allows matching recipients.
    // Use in combination with a catch-all deny rule at lower priority.
    return RuleBuilder.create('allow-recipients')
        .name(`Allow only: ${patterns.join(', ')}`)
        .recipients(...patterns)
        .action('allow')
        .priority(50)
        .build();
}
/**
 * Create a catch-all deny rule (use as the last rule in a policy).
 */
export function denyAll() {
    return RuleBuilder.create('deny-all')
        .name('Deny all (catch-all)')
        .action('deny')
        .priority(9999)
        .build();
}
/**
 * Create a catch-all allow rule (use as the last rule in a policy).
 */
export function allowAll() {
    return RuleBuilder.create('allow-all')
        .name('Allow all (catch-all)')
        .action('allow')
        .priority(9999)
        .build();
}
//# sourceMappingURL=rules.js.map