// =============================================================================
// Glob Pattern Matching
// Adapted from AgentGate's PolicyEngine — simple wildcard matching
// Supports: '*' (any chars), '?' (single char), exact match
// Examples: '*.verified', 'agent://*', '0x1234*'
// =============================================================================
/**
 * Match a value against a glob pattern.
 *
 * @param value - The string to test
 * @param pattern - Glob pattern with optional '*' and '?' wildcards
 * @returns true if the value matches the pattern
 *
 * @example
 * ```ts
 * matchesGlob('api.openai.com', '*.openai.com') // true
 * matchesGlob('agent://123', 'agent://*')       // true
 * matchesGlob('0x1234abcd', '0x1234*')          // true
 * matchesGlob('foo', 'bar')                     // false
 * ```
 */
export function matchesGlob(value, pattern) {
    // Fast paths
    if (pattern === value)
        return true;
    if (pattern === '*')
        return true;
    // Convert glob pattern to regex
    let regexStr = '^';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i];
        switch (char) {
            case '*':
                regexStr += '.*';
                break;
            case '?':
                regexStr += '.';
                break;
            case '.':
            case '+':
            case '^':
            case '$':
            case '{':
            case '}':
            case '(':
            case ')':
            case '|':
            case '[':
            case ']':
            case '\\':
                regexStr += '\\' + char;
                break;
            default:
                regexStr += char;
        }
    }
    regexStr += '$';
    try {
        return new RegExp(regexStr).test(value);
    }
    catch {
        return pattern === value;
    }
}
//# sourceMappingURL=glob.js.map