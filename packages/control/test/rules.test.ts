import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RuleBuilder,
  blockAbove,
  requireApprovalAbove,
  allowAll,
  denyAll,
  blockRecipient,
} from '../src/rules.js';

describe('RuleBuilder', () => {
  it('creates a rule with fluent API', () => {
    const rule = RuleBuilder.create('test-rule')
      .name('Test Rule')
      .action('deny')
      .minAmount(100)
      .currencies('USDC')
      .priority(5)
      .build();

    assert.equal(rule.id, 'test-rule');
    assert.equal(rule.name, 'Test Rule');
    assert.equal(rule.action, 'deny');
    assert.equal(rule.conditions.minAmount, 100);
    assert.deepEqual(rule.conditions.currencies, ['USDC']);
    assert.equal(rule.priority, 5);
    assert.equal(rule.enabled, true);
  });

  it('auto-generates ID when not provided', () => {
    const rule = RuleBuilder.create().name('No ID').build();
    assert.ok(rule.id.startsWith('rule_'));
  });
});

describe('pre-built rules', () => {
  it('blockAbove', () => {
    const rule = blockAbove(500, 'USDC');
    assert.equal(rule.action, 'deny');
    assert.equal(rule.conditions.minAmount, 500);
    assert.deepEqual(rule.conditions.currencies, ['USDC']);
  });

  it('requireApprovalAbove', () => {
    const rule = requireApprovalAbove(100, 'ETH');
    assert.equal(rule.action, 'require_approval');
    assert.equal(rule.conditions.minAmount, 100);
  });

  it('allowAll matches everything', () => {
    const rule = allowAll();
    assert.equal(rule.action, 'allow');
    assert.equal(rule.priority, 9999);
  });

  it('denyAll matches everything', () => {
    const rule = denyAll();
    assert.equal(rule.action, 'deny');
    assert.equal(rule.priority, 9999);
  });

  it('blockRecipient', () => {
    const rule = blockRecipient('*.sketchy.xyz');
    assert.equal(rule.action, 'deny');
    assert.deepEqual(rule.conditions.recipients, ['*.sketchy.xyz']);
  });
});
