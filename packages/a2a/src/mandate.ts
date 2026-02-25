// =============================================================================
// MandateManager — recurring payment authorization between agents
// Grants one agent the right to pull funds from another, within limits.
// =============================================================================

import type {
  AgentId,
  MandateId,
  AgentMandate,
  MandateStatus,
  TimeWindow,
} from '@paysentry/core';
import { generateId, EventBus } from '@paysentry/core';

export interface CreateMandateInput {
  readonly grantor: AgentId;
  readonly grantee: AgentId;
  readonly maxPerTransaction: number;
  readonly maxCumulative: number;
  readonly currency: string;
  readonly maxPerWindow?: { amount: number; window: TimeWindow };
  readonly allowedPurposes?: string[];
  readonly allowedRecipients?: string[];
  readonly expiresInMs?: number;
}

export class MandateManager {
  private readonly mandates = new Map<MandateId, AgentMandate>();
  private readonly events?: EventBus;

  constructor(options?: { events?: EventBus }) {
    this.events = options?.events;
  }

  /**
   * Create a mandate granting grantee the right to pull funds from grantor.
   */
  create(input: CreateMandateInput): AgentMandate {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInMs ?? 30 * 86_400_000)).toISOString();

    const mandate: AgentMandate = {
      id: generateId('mdt') as MandateId,
      grantor: input.grantor,
      grantee: input.grantee,
      maxPerTransaction: input.maxPerTransaction,
      maxCumulative: input.maxCumulative,
      maxPerWindow: input.maxPerWindow,
      currency: input.currency,
      allowedPurposes: input.allowedPurposes,
      allowedRecipients: input.allowedRecipients,
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt,
      spent: 0,
      transactionCount: 0,
    };

    this.mandates.set(mandate.id, mandate);
    this.events?.emit({ type: 'mandate.created', mandateId: mandate.id, grantor: input.grantor, grantee: input.grantee });
    return mandate;
  }

  /**
   * Validate whether a mandate allows a specific transaction.
   * Returns { allowed, reason }.
   */
  validate(mandateId: MandateId, amount: number, purpose?: string, recipient?: string): { allowed: boolean; reason: string } {
    const mandate = this.mandates.get(mandateId);
    if (!mandate) return { allowed: false, reason: 'Mandate not found' };

    // Status checks
    if (mandate.status !== 'active') return { allowed: false, reason: `Mandate is ${mandate.status}` };
    if (new Date(mandate.expiresAt).getTime() < Date.now()) {
      mandate.status = 'expired';
      return { allowed: false, reason: 'Mandate has expired' };
    }

    // Amount checks
    if (amount > mandate.maxPerTransaction) {
      return { allowed: false, reason: `Amount $${amount} exceeds per-transaction limit of $${mandate.maxPerTransaction}` };
    }
    if (mandate.spent + amount > mandate.maxCumulative) {
      return { allowed: false, reason: `Cumulative spend would exceed limit of $${mandate.maxCumulative}` };
    }

    // Purpose check
    if (mandate.allowedPurposes && mandate.allowedPurposes.length > 0 && purpose) {
      const purposeAllowed = mandate.allowedPurposes.some((p) =>
        purpose.toLowerCase().includes(p.toLowerCase())
      );
      if (!purposeAllowed) {
        return { allowed: false, reason: `Purpose "${purpose}" not in allowed purposes` };
      }
    }

    // Recipient check
    if (mandate.allowedRecipients && mandate.allowedRecipients.length > 0 && recipient) {
      const recipientAllowed = mandate.allowedRecipients.some((r) =>
        recipient.toLowerCase().includes(r.toLowerCase())
      );
      if (!recipientAllowed) {
        return { allowed: false, reason: `Recipient "${recipient}" not in allowed recipients` };
      }
    }

    return { allowed: true, reason: 'Mandate allows this transaction' };
  }

  /**
   * Record a spend against a mandate (call after successful payment).
   */
  recordSpend(mandateId: MandateId, amount: number): void {
    const mandate = this.mandates.get(mandateId);
    if (!mandate) throw new Error(`Mandate ${mandateId} not found`);

    mandate.spent += amount;
    mandate.transactionCount++;

    if (mandate.spent >= mandate.maxCumulative) {
      mandate.status = 'exhausted';
    }
  }

  /**
   * Revoke a mandate.
   */
  revoke(mandateId: MandateId): AgentMandate {
    const mandate = this.mandates.get(mandateId);
    if (!mandate) throw new Error(`Mandate ${mandateId} not found`);

    mandate.status = 'revoked';
    mandate.revokedAt = new Date().toISOString();

    this.events?.emit({ type: 'mandate.revoked', mandateId: mandate.id });
    return mandate;
  }

  /**
   * Get a mandate by ID.
   */
  get(mandateId: MandateId): AgentMandate | undefined {
    return this.mandates.get(mandateId);
  }

  /**
   * List mandates for an agent (as grantor or grantee).
   */
  listForAgent(agentId: AgentId, role?: 'grantor' | 'grantee'): AgentMandate[] {
    const results: AgentMandate[] = [];
    for (const m of this.mandates.values()) {
      if (role === 'grantor' && m.grantor !== agentId) continue;
      if (role === 'grantee' && m.grantee !== agentId) continue;
      if (!role && m.grantor !== agentId && m.grantee !== agentId) continue;
      results.push(m);
    }
    return results;
  }

  /**
   * List all mandates with optional status filter.
   */
  list(status?: MandateStatus): AgentMandate[] {
    const results: AgentMandate[] = [];
    for (const m of this.mandates.values()) {
      if (status && m.status !== status) continue;
      results.push(m);
    }
    return results;
  }
}
