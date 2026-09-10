import { describe, expect, test } from 'vitest';
import { parseRefinementInput } from '../server/lib/refinement-input';

describe('refinement request validation', () => {
  test.each([undefined, 'text', 'visual'] as const)('preserves long %s briefs without truncating them', (kind) => {
    for (const length of [4172, 100_001, 1_000_000]) {
      const brief = 'ä'.repeat(length - 12) + '\nEND OF GOAL';
      expect(parseRefinementInput({ kind, brief }).brief).toBe(brief);
    }
  });

  test.each([null, {}, [], 42])('rejects a non-text brief with a client error: %j', (brief) => {
    if (brief === null) {
      expect(parseRefinementInput({ brief })).toEqual({ brief: null });
      return;
    }
    expect(() => parseRefinementInput({ brief })).toThrowError(expect.objectContaining({
      statusCode: 400, statusMessage: 'refinement_invalid_input',
    }));
  });

  test('still validates the requested kind and capture settings', () => {
    for (const input of [{ kind: 'unknown' }, { visualSettings: { mobile: 'yes' } }]) {
      expect(() => parseRefinementInput(input)).toThrowError(expect.objectContaining({ statusCode: 400 }));
    }
  });
});
