import { describe, expect, it } from 'vitest';
import {
  isInternalQaBusinessId,
  parseInternalQaBusinessIds,
} from '@/lib/internal-qa-access';

describe('internal QA business allowlist', () => {
  const qaId = 'cmr2h7pna55f22d2288316407';

  it('parses comma-separated exact IDs', () => {
    expect([...parseInternalQaBusinessIds(`${qaId}, other-id`)]).toEqual([qaId, 'other-id']);
  });

  it('defaults to empty when unset', () => {
    expect(parseInternalQaBusinessIds(undefined).size).toBe(0);
    expect(parseInternalQaBusinessIds('')).toEqual(new Set());
    expect(parseInternalQaBusinessIds('   ')).toEqual(new Set());
  });

  it('matches only exact business IDs', () => {
    expect(isInternalQaBusinessId(qaId, qaId)).toBe(true);
    expect(isInternalQaBusinessId('cmr2h7pn', qaId)).toBe(false);
    expect(isInternalQaBusinessId(`${qaId}x`, qaId)).toBe(false);
  });

  it('does not grant access from name or email-like strings', () => {
    expect(isInternalQaBusinessId('TillFlow QA Demo', qaId)).toBe(false);
    expect(isInternalQaBusinessId('qa-owner@tillflow.app', qaId)).toBe(false);
  });

  it('rejects null/empty business ids', () => {
    expect(isInternalQaBusinessId(null, qaId)).toBe(false);
    expect(isInternalQaBusinessId('', qaId)).toBe(false);
  });
});
