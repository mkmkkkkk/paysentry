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
export declare function matchesGlob(value: string, pattern: string): boolean;
//# sourceMappingURL=glob.d.ts.map