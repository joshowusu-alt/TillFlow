import { describe, expect, it } from 'vitest';
import {
  BUILTIN_INTERNAL_QA_BUSINESS_IDS,
  isInternalQaBusinessId,
  parseInternalQaBusinessIds,
} from '@/lib/internal-qa-access';

describe('internal QA business allowlist', () => {
  const qaId = BUILTIN_INTERNAL_QA_BUSINESS_IDS[0];

  it('always includes the built-in TillFlow QA Demo ID', () => {
    expect(parseInternalQaBusinessIds(null).has(qaId)).toBe(true);
    expect(parseInternalQaBusinessIds('').has(qaId)).toBe(true);
    expect(isInternalQaBusinessId(qaId, '')).toBe(true);
    expect(isInternalQaBusinessId(qaId, null)).toBe(true);
  });

  it('merges optional env IDs with built-ins', () => {
    const ids = parseInternalQaBusinessIds(`${qaId}, other-id`);
    expect(ids.has(qaId)).toBe(true);
    expect(ids.has('other-id')).toBe(true);
  });

  it('matches only exact business IDs', () => {
    expect(isInternalQaBusinessId(qaId, '')).toBe(true);
    expect(isInternalQaBusinessId('cmr2h7pn', '')).toBe(false);
    expect(isInternalQaBusinessId(`${qaId}x`, '')).toBe(false);
  });

  it('does not grant access from name or email-like strings', () => {
    expect(isInternalQaBusinessId('TillFlow QA Demo', '')).toBe(false);
    expect(isInternalQaBusinessId('qa-owner@tillflow.app', '')).toBe(false);
  });

  it('rejects null/empty business ids', () => {
    expect(isInternalQaBusinessId(null, qaId)).toBe(false);
    expect(isInternalQaBusinessId('', qaId)).toBe(false);
  });
});
