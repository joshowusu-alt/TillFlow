import { describe, expect, it } from 'vitest';
import { hostsMatch, normalizeComparableHost } from './middleware';

describe('normalizeComparableHost', () => {
  it('normalizes loopback aliases with the same port', () => {
    expect(normalizeComparableHost('localhost:6200')).toBe('loopback:6200');
    expect(normalizeComparableHost('127.0.0.1:6200')).toBe('loopback:6200');
    expect(normalizeComparableHost('[::1]:6200')).toBe('loopback:6200');
  });

  it('leaves non-loopback hosts unchanged', () => {
    expect(normalizeComparableHost('store.example.com')).toBe('store.example.com');
    expect(normalizeComparableHost('store.example.com:443')).toBe('store.example.com:443');
  });
});

describe('hostsMatch', () => {
  it('treats localhost and 127.0.0.1 as equivalent loopback origins', () => {
    expect(hostsMatch('localhost:6200', '127.0.0.1:6200')).toBe(true);
    expect(hostsMatch('localhost:6200', '[::1]:6200')).toBe(true);
  });

  it('rejects loopback hosts on different ports', () => {
    expect(hostsMatch('localhost:6200', '127.0.0.1:6201')).toBe(false);
  });

  it('rejects unrelated external hosts', () => {
    expect(hostsMatch('localhost:6200', 'example.com:6200')).toBe(false);
  });
});