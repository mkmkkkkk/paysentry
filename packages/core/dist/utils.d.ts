import type { TransactionId, DisputeId } from './types.js';
/**
 * Generate a unique identifier with the given prefix.
 * Format: <prefix>_<hex_timestamp>_<random>
 *
 * @param prefix - Short string prefix (e.g., 'ps', 'dsp')
 * @returns A unique string identifier
 */
export declare function generateId(prefix: string): string;
/**
 * Generate a unique transaction ID.
 * Format: ps_<hex_timestamp>_<random>
 */
export declare function generateTransactionId(): TransactionId;
/**
 * Generate a unique dispute ID.
 * Format: dsp_<hex_timestamp>_<random>
 */
export declare function generateDisputeId(): DisputeId;
//# sourceMappingURL=utils.d.ts.map