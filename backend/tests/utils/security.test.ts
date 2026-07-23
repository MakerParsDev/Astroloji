import { describe, expect, it } from 'vitest';

import { matchesSecret, timingSafeEqualStrings } from '@/utils/security';

describe('security helpers', () => {
  it('accepts only identical secrets', () => {
    expect(matchesSecret('admin-secret', 'admin-secret')).toBe(true);
    expect(matchesSecret('admin-secret', 'wrong-secret')).toBe(false);
    expect(matchesSecret('admin-secret', null)).toBe(false);
  });

  it('handles length mismatches without throwing', () => {
    expect(timingSafeEqualStrings('abc', 'ab')).toBe(false);
    expect(timingSafeEqualStrings('same-value', 'same-value')).toBe(true);
  });
});
