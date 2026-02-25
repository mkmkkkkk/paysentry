// =============================================================================
// AgentRegistry — agent identity and discovery
// Agents register themselves, discover each other, build trust over time.
// =============================================================================

import type {
  AgentId,
  AgentProfile,
  AgentCapability,
  PolicyId,
} from '@paysentry/core';
import { generateId } from '@paysentry/core';

export interface RegisterAgentInput {
  readonly name: string;
  readonly capabilities: AgentCapability[];
  readonly policies?: PolicyId[];
  readonly metadata?: Record<string, unknown>;
}

export class AgentRegistry {
  private readonly agents = new Map<AgentId, AgentProfile>();

  /**
   * Register a new agent. Returns the profile with generated ID.
   */
  register(input: RegisterAgentInput): AgentProfile {
    const profile: AgentProfile = {
      id: generateId('agt') as AgentId,
      name: input.name,
      capabilities: input.capabilities,
      trustScore: 50, // Start at neutral
      totalSpent: 0,
      registeredAt: new Date().toISOString(),
      policies: input.policies ?? [],
      metadata: Object.freeze(input.metadata ?? {}),
    };

    this.agents.set(profile.id, profile);
    return profile;
  }

  /**
   * Register with a specific ID (for pre-existing agents).
   */
  registerWithId(id: AgentId, input: RegisterAgentInput): AgentProfile {
    const profile: AgentProfile = {
      id,
      name: input.name,
      capabilities: input.capabilities,
      trustScore: 50,
      totalSpent: 0,
      registeredAt: new Date().toISOString(),
      policies: input.policies ?? [],
      metadata: Object.freeze(input.metadata ?? {}),
    };

    this.agents.set(id, profile);
    return profile;
  }

  /**
   * Get agent by ID.
   */
  get(id: AgentId): AgentProfile | undefined {
    return this.agents.get(id);
  }

  /**
   * List all agents, optionally filtered by capability.
   */
  list(capability?: AgentCapability): AgentProfile[] {
    const results: AgentProfile[] = [];
    for (const a of this.agents.values()) {
      if (capability && !a.capabilities.includes(capability)) continue;
      results.push(a);
    }
    return results;
  }

  /**
   * Update trust score based on transaction history.
   * Simple algorithm: +1 for completed, -5 for disputed, -2 for failed.
   */
  updateTrustScore(id: AgentId, event: 'completed' | 'disputed' | 'failed'): void {
    const agent = this.agents.get(id);
    if (!agent) return;

    const delta = event === 'completed' ? 1 : event === 'disputed' ? -5 : -2;
    agent.trustScore = Math.max(0, Math.min(100, agent.trustScore + delta));
  }

  /**
   * Record spend for an agent.
   */
  recordSpend(id: AgentId, amount: number): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.totalSpent += amount;
  }

  /**
   * Check if an agent has a specific capability.
   */
  hasCapability(id: AgentId, capability: AgentCapability): boolean {
    const agent = this.agents.get(id);
    return agent?.capabilities.includes(capability) ?? false;
  }

  /**
   * Total registered agents.
   */
  get size(): number {
    return this.agents.size;
  }
}
