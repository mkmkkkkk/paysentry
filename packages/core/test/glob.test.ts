import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesGlob } from '../src/glob.js';

describe('matchesGlob', () => {
  it('exact match', () => {
    assert.equal(matchesGlob('foo', 'foo'), true);
  });

  it('* matches everything', () => {
    assert.equal(matchesGlob('anything', '*'), true);
    assert.equal(matchesGlob('', '*'), true);
  });

  it('* wildcard at end', () => {
    assert.equal(matchesGlob('agent-123', 'agent-*'), true);
    assert.equal(matchesGlob('agent-', 'agent-*'), true);
    assert.equal(matchesGlob('other-123', 'agent-*'), false);
  });

  it('* wildcard at start', () => {
    assert.equal(matchesGlob('api.openai.com', '*.openai.com'), true);
    assert.equal(matchesGlob('openai.com', '*.openai.com'), false);
  });

  it('? matches single character', () => {
    assert.equal(matchesGlob('a1', 'a?'), true);
    assert.equal(matchesGlob('ab', 'a?'), true);
    assert.equal(matchesGlob('abc', 'a?'), false);
  });

  it('no match', () => {
    assert.equal(matchesGlob('foo', 'bar'), false);
  });

  it('regex special chars are escaped', () => {
    assert.equal(matchesGlob('foo.bar', 'foo.bar'), true);
    assert.equal(matchesGlob('fooXbar', 'foo.bar'), false);
    assert.equal(matchesGlob('(test)', '(test)'), true);
  });
});
