import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createDashboardServer } from '../src/server.js';
import type { DashboardDeps } from '../src/server.js';
import { EventBus } from '@paysentry/core';
import { PolicyEngine } from '@paysentry/control';
import { SpendTracker, SpendAnalytics } from '@paysentry/observe';
import { TransactionProvenance, DisputeManager } from '@paysentry/protect';

function makeDeps(): DashboardDeps {
  const tracker = new SpendTracker();
  return {
    policyEngine: new PolicyEngine(),
    tracker,
    analytics: new SpendAnalytics(tracker),
    provenance: new TransactionProvenance(),
    disputes: new DisputeManager(),
    events: new EventBus(),
  };
}

function fetch(port: number, path: string, headers?: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
  });
}

describe('Dashboard Server', () => {
  let server: http.Server;
  let port: number;

  afterEach((_, done) => {
    if (server) server.close(done);
    else done?.();
  });

  describe('basic endpoints', () => {
    beforeEach((_, done) => {
      server = createDashboardServer(makeDeps(), { port: 0, host: '127.0.0.1' });
      server.on('listening', () => {
        port = (server.address() as { port: number }).port;
        done?.();
      });
    });

    it('returns status', async () => {
      const { status, body } = await fetch(port, '/status');
      assert.equal(status, 200);
      const data = JSON.parse(body);
      assert.equal(data.status, 'running');
      assert.equal(typeof data.uptime, 'number');
    });

    it('returns transactions', async () => {
      const { status, body } = await fetch(port, '/transactions');
      assert.equal(status, 200);
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data.transactions));
      assert.equal(data.count, 0);
    });

    it('returns policies', async () => {
      const { status, body } = await fetch(port, '/policies');
      assert.equal(status, 200);
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data.policies));
    });

    it('returns disputes', async () => {
      const { status, body } = await fetch(port, '/disputes');
      assert.equal(status, 200);
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data.disputes));
    });

    it('returns agents without registry', async () => {
      const { status, body } = await fetch(port, '/agents');
      assert.equal(status, 200);
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data.agents));
      assert.ok(data.message);
    });

    it('returns 404 for unknown path', async () => {
      const { status, body } = await fetch(port, '/unknown');
      assert.equal(status, 404);
      const data = JSON.parse(body);
      assert.equal(data.error, 'Not found');
    });

    it('returns HTML at root', async () => {
      const { status, body } = await fetch(port, '/');
      assert.equal(status, 200);
      assert.ok(body.includes('PaySentry Dashboard'));
    });

    it('validates dispute status parameter', async () => {
      const { status, body } = await fetch(port, '/disputes?status=invalid');
      assert.equal(status, 400);
      const data = JSON.parse(body);
      assert.ok(data.error.includes('Invalid status'));
    });

    it('clamps transaction limit', async () => {
      const { status, body } = await fetch(port, '/transactions?limit=abc');
      assert.equal(status, 200);
      // NaN falls back to 50
      const data = JSON.parse(body);
      assert.ok(Array.isArray(data.transactions));
    });
  });

  describe('Bearer token auth', () => {
    beforeEach((_, done) => {
      server = createDashboardServer(makeDeps(), { port: 0, host: '127.0.0.1', bearerToken: 'test-secret' });
      server.on('listening', () => {
        port = (server.address() as { port: number }).port;
        done?.();
      });
    });

    it('rejects requests without token', async () => {
      const { status, body } = await fetch(port, '/status');
      assert.equal(status, 401);
      const data = JSON.parse(body);
      assert.equal(data.error, 'Unauthorized');
    });

    it('rejects requests with wrong token', async () => {
      const { status } = await fetch(port, '/status', { Authorization: 'Bearer wrong' });
      assert.equal(status, 401);
    });

    it('allows requests with correct token', async () => {
      const { status, body } = await fetch(port, '/status', { Authorization: 'Bearer test-secret' });
      assert.equal(status, 200);
      const data = JSON.parse(body);
      assert.equal(data.status, 'running');
    });
  });

  describe('SSE connection limit', () => {
    beforeEach((_, done) => {
      server = createDashboardServer(makeDeps(), { port: 0, host: '127.0.0.1', maxSSEConnections: 2 });
      server.on('listening', () => {
        port = (server.address() as { port: number }).port;
        done?.();
      });
    });

    it('rejects SSE when at max connections', async () => {
      // Open 2 SSE connections
      const conn1 = http.get({ hostname: '127.0.0.1', port, path: '/events' });
      const conn2 = http.get({ hostname: '127.0.0.1', port, path: '/events' });

      // Wait for them to connect
      await new Promise((r) => setTimeout(r, 100));

      // 3rd should be rejected
      const { status, body } = await fetch(port, '/events');
      assert.equal(status, 429);
      const data = JSON.parse(body);
      assert.ok(data.error.includes('Too many'));

      conn1.destroy();
      conn2.destroy();
    });
  });
});
