// =============================================================================
// Event Bus — typed event system for all PaySentry state changes
// Agents subscribe via MCP SSE. Every state change emits an event.
// =============================================================================

import type {
  AgentTransaction,
  PolicyEvaluation,
  SpendAlert,
  DisputeCase,
  AgentId,
  PolicyId,
  TimeWindow,
} from './types.js';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

export type PaySentryEvent =
  | { type: 'transaction.created'; transaction: AgentTransaction }
  | { type: 'transaction.completed'; transaction: AgentTransaction }
  | { type: 'transaction.denied'; transaction: AgentTransaction; reason: string }
  | { type: 'transaction.failed'; transaction: AgentTransaction; error: string }
  | { type: 'policy.evaluated'; transaction: AgentTransaction; evaluation: PolicyEvaluation }
  | { type: 'policy.loaded'; policyId: PolicyId }
  | { type: 'policy.removed'; policyId: PolicyId }
  | { type: 'alert.fired'; alert: SpendAlert }
  | { type: 'dispute.opened'; dispute: DisputeCase }
  | { type: 'dispute.resolved'; dispute: DisputeCase }
  | { type: 'budget.threshold'; agentId: AgentId; percentUsed: number; window: TimeWindow }
  | { type: 'circuit_breaker.opened'; facilitator: string; failures: number }
  | { type: 'circuit_breaker.closed'; facilitator: string }
  | { type: 'mandate.created'; mandateId: string; grantor: AgentId; grantee: AgentId }
  | { type: 'mandate.revoked'; mandateId: string }
  | { type: 'escrow.funded'; escrowId: string; amount: number; currency: string }
  | { type: 'escrow.released'; escrowId: string }
  | { type: 'intent.proposed'; intentId: string; from: AgentId; to: AgentId; amount: number }
  | { type: 'intent.accepted'; intentId: string }
  | { type: 'intent.rejected'; intentId: string; reason: string };

export type PaySentryEventType = PaySentryEvent['type'];

type EventHandler = (event: PaySentryEvent) => void | Promise<void>;
type TypedHandler<T extends PaySentryEventType> = (
  event: Extract<PaySentryEvent, { type: T }>
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Event Bus
// ---------------------------------------------------------------------------

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly wildcardHandlers = new Set<EventHandler>();

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<T extends PaySentryEventType>(type: T, handler: TypedHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const h = handler as EventHandler;
    set.add(h);
    return () => { set!.delete(h); };
  }

  /**
   * Subscribe to ALL events (wildcard).
   * Returns an unsubscribe function.
   */
  onAny(handler: EventHandler): () => void {
    this.wildcardHandlers.add(handler);
    return () => { this.wildcardHandlers.delete(handler); };
  }

  /**
   * Subscribe to a specific event type, auto-unsubscribe after first fire.
   */
  once<T extends PaySentryEventType>(type: T, handler: TypedHandler<T>): void {
    const unsub = this.on(type, (event) => {
      unsub();
      handler(event);
    });
  }

  /**
   * Emit an event to all matching subscribers.
   */
  emit(event: PaySentryEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const h of handlers) {
        try { h(event); } catch { /* swallow handler errors */ }
      }
    }
    for (const h of this.wildcardHandlers) {
      try { h(event); } catch { /* swallow handler errors */ }
    }
  }

  /**
   * Remove all handlers.
   */
  clear(): void {
    this.handlers.clear();
    this.wildcardHandlers.clear();
  }
}
