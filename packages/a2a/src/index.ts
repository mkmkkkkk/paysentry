// =============================================================================
// @paysentry/a2a — Public API
// Agent-to-agent payment primitives
// =============================================================================

export { PaymentIntentManager } from './intent.js';
export type { ProposeIntentInput, CounterOfferInput } from './intent.js';

export { MandateManager } from './mandate.js';
export type { CreateMandateInput } from './mandate.js';

export { EscrowManager } from './escrow.js';
export type { CreateEscrowInput } from './escrow.js';

export { AgentRegistry } from './registry.js';
export type { RegisterAgentInput } from './registry.js';
