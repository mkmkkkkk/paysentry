// =============================================================================
// @paysentry/dashboard — JSON-over-HTTP dashboard for agents
// Not a React SPA. A structured API that agents query for operational status.
// Every endpoint returns JSON. Optional HTML view for humans.
// =============================================================================

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import type { EventBus, PaySentryEvent } from '@paysentry/core';
import type { PolicyEngine } from '@paysentry/control';
import type { SpendTracker, SpendAnalytics, SpendAlerts } from '@paysentry/observe';
import type { TransactionProvenance, DisputeManager } from '@paysentry/protect';
import type { AgentRegistry } from '@paysentry/a2a';

export interface DashboardConfig {
  readonly port?: number;
  readonly host?: string;
}

export interface DashboardDeps {
  readonly policyEngine: PolicyEngine;
  readonly tracker: SpendTracker;
  readonly analytics: SpendAnalytics;
  readonly provenance: TransactionProvenance;
  readonly disputes: DisputeManager;
  readonly events: EventBus;
  readonly registry?: AgentRegistry;
}

/**
 * Create and start the dashboard HTTP server.
 * Returns the server instance for programmatic control.
 */
export function createDashboardServer(deps: DashboardDeps, config?: DashboardConfig) {
  const port = config?.port ?? 3100;
  const host = config?.host ?? '0.0.0.0';

  // SSE clients
  const sseClients = new Set<ServerResponse>();

  // Wire events to SSE
  deps.events.onAny((event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      try { client.write(data); } catch { sseClients.delete(client); }
    }
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route
    if (path === '/status') return handleStatus(deps, res);
    if (path === '/transactions') return handleTransactions(deps, url, res);
    if (path === '/policies') return handlePolicies(deps, res);
    if (path === '/alerts') return handleAlerts(deps, url, res);
    if (path === '/disputes') return handleDisputes(deps, url, res);
    if (path === '/agents') return handleAgents(deps, res);
    if (path === '/events') return handleSSE(sseClients, req, res);
    if (path === '/' || path === '/index.html') return handleHTML(deps, res);

    json(res, 404, { error: 'Not found', availableEndpoints: ['/status', '/transactions', '/policies', '/alerts', '/disputes', '/agents', '/events'] });
  });

  server.listen(port, host);
  return server;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleStatus(deps: DashboardDeps, res: ServerResponse) {
  const policies = deps.policyEngine.getPolicies();
  json(res, 200, {
    status: 'running',
    uptime: process.uptime(),
    transactions: deps.tracker.size,
    policies: policies.length,
    agents: deps.registry?.size ?? 0,
    activePolicies: policies.filter(p => p.enabled).map(p => ({ id: p.id, name: p.name })),
  });
}

function handleTransactions(deps: DashboardDeps, url: URL, res: ServerResponse) {
  const limit = parseInt(url.searchParams.get('limit') ?? '50');
  const agentId = url.searchParams.get('agent_id');
  const filter: any = { limit };
  if (agentId) filter.agentId = agentId;
  const txs = deps.tracker.query(filter);
  json(res, 200, { transactions: txs, count: txs.length, total: deps.tracker.size });
}

function handlePolicies(deps: DashboardDeps, res: ServerResponse) {
  json(res, 200, { policies: deps.policyEngine.getPolicies() });
}

function handleAlerts(deps: DashboardDeps, url: URL, res: ServerResponse) {
  // SpendAlerts doesn't expose a log by default, return alert rules
  json(res, 200, { message: 'Use SSE /events endpoint to receive alerts in real-time', endpoint: '/events' });
}

function handleDisputes(deps: DashboardDeps, url: URL, res: ServerResponse) {
  const status = url.searchParams.get('status');
  const disputes = deps.disputes.query(status ? { status: status as any } : {});
  json(res, 200, { disputes, count: disputes.length });
}

function handleAgents(deps: DashboardDeps, res: ServerResponse) {
  if (!deps.registry) {
    json(res, 200, { agents: [], message: 'No AgentRegistry configured' });
    return;
  }
  json(res, 200, { agents: deps.registry.list() });
}

function handleSSE(clients: Set<ServerResponse>, req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  clients.add(res);
  req.on('close', () => { clients.delete(res); });
}

function handleHTML(deps: DashboardDeps, res: ServerResponse) {
  // Minimal HTML that fetches from JSON endpoints
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>PaySentry Dashboard</title>
<style>
body{font-family:monospace;background:#0d1117;color:#c9d1d9;max-width:80ch;margin:0 auto;padding:2rem;font-size:14px}
h1{font-size:1.2em;color:#f0f6fc}
pre{background:#161b22;border:1px solid #21262d;padding:1em;overflow-x:auto;font-size:13px}
.endpoint{color:#58a6ff;cursor:pointer}
.endpoint:hover{text-decoration:underline}
#output{white-space:pre-wrap}
</style></head><body>
<h1>PaySentry Dashboard</h1>
<p>Agent-readable JSON API. Click an endpoint:</p>
<p><span class="endpoint" onclick="load('/status')">/status</span> |
<span class="endpoint" onclick="load('/transactions')">/transactions</span> |
<span class="endpoint" onclick="load('/policies')">/policies</span> |
<span class="endpoint" onclick="load('/disputes')">/disputes</span> |
<span class="endpoint" onclick="load('/agents')">/agents</span></p>
<p>Live events: <span class="endpoint" onclick="startSSE()">/events (SSE)</span></p>
<pre id="output">Click an endpoint above.</pre>
<script>
async function load(path){
  const r=await fetch(path);
  document.getElementById('output').textContent=JSON.stringify(await r.json(),null,2);
}
function startSSE(){
  const es=new EventSource('/events');
  const out=document.getElementById('output');
  out.textContent='Listening for events...\\n';
  es.onmessage=e=>{out.textContent+=e.data+'\\n'};
}
</script></body></html>`;

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}
