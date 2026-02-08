import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, CircuitBreakerOpenError } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, recoveryTimeoutMs: 100, halfOpenMaxRequests: 1 });
  });

  it('starts in closed state', () => {
    assert.equal(breaker.getState('test'), 'closed');
  });

  it('passes through successful calls', async () => {
    const result = await breaker.execute('test', async () => 42);
    assert.equal(result, 42);
    assert.equal(breaker.getState('test'), 'closed');
  });

  it('opens after reaching failure threshold', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('test', async () => { throw new Error('fail'); }));
    }
    assert.equal(breaker.getState('test'), 'open');
  });

  it('rejects calls when open', async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('test', async () => { throw new Error('fail'); }));
    }

    await assert.rejects(
      () => breaker.execute('test', async () => 'should not run'),
      (err: unknown) => {
        assert.ok(err instanceof CircuitBreakerOpenError);
        assert.equal(err.breakerKey, 'test');
        assert.ok(err.remainingMs > 0);
        return true;
      },
    );
  });

  it('transitions to half-open after recovery timeout', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('test', async () => { throw new Error('fail'); }));
    }
    assert.equal(breaker.getState('test'), 'open');

    // Wait for recovery
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(breaker.getState('test'), 'half-open');
  });

  it('closes after successful probe in half-open', async () => {
    // Trip
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('test', async () => { throw new Error('fail'); }));
    }

    await new Promise((r) => setTimeout(r, 150));

    // Probe succeeds
    const result = await breaker.execute('test', async () => 'recovered');
    assert.equal(result, 'recovered');
    assert.equal(breaker.getState('test'), 'closed');
  });

  it('re-opens after failed probe in half-open', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('test', async () => { throw new Error('fail'); }));
    }

    await new Promise((r) => setTimeout(r, 150));

    // Probe fails
    await assert.rejects(() => breaker.execute('test', async () => { throw new Error('still failing'); }));
    assert.equal(breaker.getState('test'), 'open');
  });

  it('maintains independent state per key', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('failing', async () => { throw new Error('fail'); }));
    }
    assert.equal(breaker.getState('failing'), 'open');
    assert.equal(breaker.getState('healthy'), 'closed');

    const result = await breaker.execute('healthy', async () => 'ok');
    assert.equal(result, 'ok');
  });

  it('manual reset returns to closed', async () => {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('test', async () => { throw new Error('fail'); }));
    }
    breaker.reset('test');
    assert.equal(breaker.getState('test'), 'closed');
  });

  it('getSnapshot returns all breaker states', async () => {
    await breaker.execute('a', async () => 'ok');
    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => breaker.execute('b', async () => { throw new Error('fail'); }));
    }
    const snap = breaker.getSnapshot();
    assert.equal(snap.get('a')?.state, 'closed');
    assert.equal(snap.get('b')?.state, 'open');
    assert.equal(snap.get('b')?.failureCount, 3);
  });
});
