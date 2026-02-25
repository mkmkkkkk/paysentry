// =============================================================================
// PaymentIntentManager — agent-to-agent payment negotiation
// Flow: propose → accept/counter/reject → execute
// =============================================================================

import type {
  AgentId,
  IntentId,
  PaymentIntent,
  PaymentCondition,
  PaymentProtocol,
  IntentStatus,
} from '@paysentry/core';
import { generateId, EventBus } from '@paysentry/core';

export interface ProposeIntentInput {
  readonly from: AgentId;
  readonly to: AgentId;
  readonly amount: number;
  readonly currency: string;
  readonly purpose: string;
  readonly protocol?: PaymentProtocol;
  readonly expiresInMs?: number;
  readonly conditions?: PaymentCondition[];
}

export interface CounterOfferInput {
  readonly amount: number;
  readonly reason: string;
}

export class PaymentIntentManager {
  private readonly intents = new Map<IntentId, PaymentIntent>();
  private readonly events?: EventBus;

  constructor(options?: { events?: EventBus }) {
    this.events = options?.events;
  }

  /**
   * Propose a payment from one agent to another.
   */
  propose(input: ProposeIntentInput): PaymentIntent {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInMs ?? 3_600_000)).toISOString();

    const intent: PaymentIntent = {
      id: generateId('int') as IntentId,
      from: input.from,
      to: input.to,
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose,
      protocol: input.protocol ?? 'x402',
      status: 'proposed',
      expiresAt,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      conditions: input.conditions ?? [],
    };

    this.intents.set(intent.id, intent);
    this.events?.emit({ type: 'intent.proposed', intentId: intent.id, from: input.from, to: input.to, amount: input.amount });
    return intent;
  }

  /**
   * Accept a proposed intent.
   */
  accept(intentId: IntentId): PaymentIntent {
    const intent = this.getOrThrow(intentId);
    this.assertStatus(intent, ['proposed', 'countered']);
    this.assertNotExpired(intent);

    intent.status = 'accepted';
    intent.updatedAt = new Date().toISOString();

    this.events?.emit({ type: 'intent.accepted', intentId });
    return intent;
  }

  /**
   * Reject a proposed intent.
   */
  reject(intentId: IntentId, reason: string): PaymentIntent {
    const intent = this.getOrThrow(intentId);
    this.assertStatus(intent, ['proposed', 'countered']);

    intent.status = 'rejected';
    intent.updatedAt = new Date().toISOString();

    this.events?.emit({ type: 'intent.rejected', intentId, reason });
    return intent;
  }

  /**
   * Counter-offer with a different amount.
   */
  counter(intentId: IntentId, counterOffer: CounterOfferInput): PaymentIntent {
    const intent = this.getOrThrow(intentId);
    this.assertStatus(intent, ['proposed']);
    this.assertNotExpired(intent);

    intent.status = 'countered';
    intent.counterOffer = { amount: counterOffer.amount, reason: counterOffer.reason };
    intent.updatedAt = new Date().toISOString();

    return intent;
  }

  /**
   * Mark an accepted intent as executed.
   */
  markExecuted(intentId: IntentId): PaymentIntent {
    const intent = this.getOrThrow(intentId);
    this.assertStatus(intent, ['accepted']);

    intent.status = 'executed';
    intent.updatedAt = new Date().toISOString();

    return intent;
  }

  /**
   * Get an intent by ID.
   */
  get(intentId: IntentId): PaymentIntent | undefined {
    const intent = this.intents.get(intentId);
    if (intent && this.isExpired(intent) && intent.status === 'proposed') {
      intent.status = 'expired';
      intent.updatedAt = new Date().toISOString();
    }
    return intent;
  }

  /**
   * List intents for an agent (as sender or receiver).
   */
  listForAgent(agentId: AgentId, role?: 'from' | 'to'): PaymentIntent[] {
    const results: PaymentIntent[] = [];
    for (const intent of this.intents.values()) {
      if (role === 'from' && intent.from !== agentId) continue;
      if (role === 'to' && intent.to !== agentId) continue;
      if (!role && intent.from !== agentId && intent.to !== agentId) continue;
      results.push(intent);
    }
    return results;
  }

  /**
   * List all intents with optional status filter.
   */
  list(status?: IntentStatus): PaymentIntent[] {
    const results: PaymentIntent[] = [];
    for (const intent of this.intents.values()) {
      if (status && intent.status !== status) continue;
      results.push(intent);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getOrThrow(intentId: IntentId): PaymentIntent {
    const intent = this.intents.get(intentId);
    if (!intent) throw new Error(`Intent ${intentId} not found`);
    return intent;
  }

  private assertStatus(intent: PaymentIntent, allowed: IntentStatus[]): void {
    if (!allowed.includes(intent.status)) {
      throw new Error(`Intent ${intent.id} is in status "${intent.status}", expected one of: ${allowed.join(', ')}`);
    }
  }

  private assertNotExpired(intent: PaymentIntent): void {
    if (this.isExpired(intent)) {
      intent.status = 'expired';
      intent.updatedAt = new Date().toISOString();
      throw new Error(`Intent ${intent.id} has expired`);
    }
  }

  private isExpired(intent: PaymentIntent): boolean {
    return new Date(intent.expiresAt).getTime() < Date.now();
  }
}
