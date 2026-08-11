import { describe, expect, it } from 'vitest';

import { generateInviteCode, normalizeFriendPair } from '@/services/friends';

describe('generateInviteCode', () => {
  it('generates an eight character code from the unambiguous alphabet', () => {
    const code = generateInviteCode();

    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it('generates different codes across calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));

    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('normalizeFriendPair', () => {
  it('orders the pair lexicographically regardless of argument order', () => {
    expect(normalizeFriendPair('user-b', 'user-a')).toEqual(['user-a', 'user-b']);
    expect(normalizeFriendPair('user-a', 'user-b')).toEqual(['user-a', 'user-b']);
  });
});
