import { describe, expect, it } from 'vitest';
import { isChristmasSeason } from './christmas-season';

describe('Christmas season in Africa/Accra', () => {
  it.each([
    ['2026-11-30T23:59:59.999Z', false],
    ['2026-12-01T00:00:00.000Z', true],
    ['2026-12-31T23:59:59.999Z', true],
    ['2027-01-01T00:00:00.000Z', true],
    ['2027-01-06T23:59:59.999Z', true],
    ['2027-01-07T00:00:00.000Z', false],
    ['2027-07-01T12:00:00.000Z', false],
    ['2027-12-01T00:00:00.000Z', true],
    ['2026-11-30T20:00:00-04:00', true],
    ['2027-01-07T00:00:00+02:00', true],
  ])('evaluates %s as %s', (instant, expected) => {
    expect(isChristmasSeason(new Date(instant))).toBe(expected);
  });
});
