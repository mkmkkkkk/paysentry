// =============================================================================
// EscrowManager — hold funds until conditions are met
// Critical for agent-to-agent trust: pay only on delivery.
// =============================================================================

import type {
  AgentId,
  EscrowId,
  EscrowContract,
  EscrowStatus,
  PaymentCondition,
} from '@paysentry/core';
import { generateId, EventBus } from '@paysentry/core';

export interface CreateEscrowInput {
  readonly payer: AgentId;
  readonly payee: AgentId;
  readonly amount: number;
  readonly currency: string;
  readonly purpose: string;
  readonly conditions: PaymentCondition[];
  readonly expiresInMs?: number;
}

export class EscrowManager {
  private readonly escrows = new Map<EscrowId, EscrowContract>();
  private readonly events?: EventBus;

  constructor(options?: { events?: EventBus }) {
    this.events = options?.events;
  }

  /**
   * Create and fund an escrow contract.
   */
  create(input: CreateEscrowInput): EscrowContract {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInMs ?? 7 * 86_400_000)).toISOString();

    const escrow: EscrowContract = {
      id: generateId('esc') as EscrowId,
      payer: input.payer,
      payee: input.payee,
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose,
      conditions: input.conditions.map((c) => ({ ...c, satisfied: false })),
      status: 'funded',
      createdAt: now.toISOString(),
      expiresAt,
    };

    this.escrows.set(escrow.id, escrow);
    this.events?.emit({ type: 'escrow.funded', escrowId: escrow.id, amount: input.amount, currency: input.currency });
    return escrow;
  }

  /**
   * Mark a condition as satisfied.
   */
  satisfyCondition(escrowId: EscrowId, conditionIndex: number): EscrowContract {
    const escrow = this.getOrThrow(escrowId);
    this.assertStatus(escrow, ['funded', 'conditions_met']);

    if (conditionIndex < 0 || conditionIndex >= escrow.conditions.length) {
      throw new Error(`Condition index ${conditionIndex} out of range`);
    }

    // Conditions are readonly in the type, but we need to mutate here
    (escrow.conditions[conditionIndex] as { satisfied: boolean }).satisfied = true;

    // Check if all conditions are met
    const allMet = escrow.conditions.every((c) => c.satisfied);
    if (allMet) {
      escrow.status = 'conditions_met';
    }

    return escrow;
  }

  /**
   * Release escrowed funds to the payee. Requires all conditions met.
   */
  release(escrowId: EscrowId): EscrowContract {
    const escrow = this.getOrThrow(escrowId);
    this.assertStatus(escrow, ['conditions_met']);

    escrow.status = 'released';
    escrow.releasedAt = new Date().toISOString();

    this.events?.emit({ type: 'escrow.released', escrowId: escrow.id });
    return escrow;
  }

  /**
   * Force-release without all conditions met (e.g., manual override).
   */
  forceRelease(escrowId: EscrowId): EscrowContract {
    const escrow = this.getOrThrow(escrowId);
    this.assertStatus(escrow, ['funded', 'conditions_met']);

    escrow.status = 'released';
    escrow.releasedAt = new Date().toISOString();

    this.events?.emit({ type: 'escrow.released', escrowId: escrow.id });
    return escrow;
  }

  /**
   * Refund escrowed funds to the payer.
   */
  refund(escrowId: EscrowId): EscrowContract {
    const escrow = this.getOrThrow(escrowId);
    this.assertStatus(escrow, ['funded', 'conditions_met']);

    escrow.status = 'refunded';
    escrow.refundedAt = new Date().toISOString();

    return escrow;
  }

  /**
   * Get escrow by ID.
   */
  get(escrowId: EscrowId): EscrowContract | undefined {
    const escrow = this.escrows.get(escrowId);
    if (escrow && escrow.status === 'funded' && new Date(escrow.expiresAt).getTime() < Date.now()) {
      escrow.status = 'expired';
    }
    return escrow;
  }

  /**
   * List escrows for an agent.
   */
  listForAgent(agentId: AgentId, role?: 'payer' | 'payee'): EscrowContract[] {
    const results: EscrowContract[] = [];
    for (const e of this.escrows.values()) {
      if (role === 'payer' && e.payer !== agentId) continue;
      if (role === 'payee' && e.payee !== agentId) continue;
      if (!role && e.payer !== agentId && e.payee !== agentId) continue;
      results.push(e);
    }
    return results;
  }

  /**
   * List all escrows with optional status filter.
   */
  list(status?: EscrowStatus): EscrowContract[] {
    const results: EscrowContract[] = [];
    for (const e of this.escrows.values()) {
      if (status && e.status !== status) continue;
      results.push(e);
    }
    return results;
  }

  // ---------------------------------------------------------------------------

  private getOrThrow(escrowId: EscrowId): EscrowContract {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) throw new Error(`Escrow ${escrowId} not found`);
    return escrow;
  }

  private assertStatus(escrow: EscrowContract, allowed: EscrowStatus[]): void {
    if (!allowed.includes(escrow.status)) {
      throw new Error(`Escrow ${escrow.id} is "${escrow.status}", expected: ${allowed.join(', ')}`);
    }
  }
}
