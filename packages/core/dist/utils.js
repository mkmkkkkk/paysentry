// =============================================================================
// Shared Utilities
// =============================================================================
/**
 * Generate a unique identifier with the given prefix.
 * Format: <prefix>_<hex_timestamp>_<random>
 *
 * @param prefix - Short string prefix (e.g., 'ps', 'dsp')
 * @returns A unique string identifier
 */
export function generateId(prefix) {
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
}
/**
 * Generate a unique transaction ID.
 * Format: ps_<hex_timestamp>_<random>
 */
export function generateTransactionId() {
    return generateId('ps');
}
/**
 * Generate a unique dispute ID.
 * Format: dsp_<hex_timestamp>_<random>
 */
export function generateDisputeId() {
    return generateId('dsp');
}
//# sourceMappingURL=utils.js.map