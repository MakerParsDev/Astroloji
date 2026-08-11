import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

describe('GET /cities/search', () => {
  it('does not require authentication', async () => {
    const response = await createApp().request('/api/v1/cities/search?q=istanbul', {}, createTestEnv());
    expect(response.status).toBe(200);
  });

  it('returns matching cities with coordinates and time zone', async () => {
    const response = await createApp().request('/api/v1/cities/search?q=istanbul', {}, createTestEnv());
    const body = (await response.json()) as { cities: Array<{ id: string; name: string; tzid: string }> };

    expect(body.cities[0]).toMatchObject({ id: 'istanbul-tr', name: 'Istanbul', tzid: 'Europe/Istanbul' });
  });

  it('returns an empty list for a query below the minimum length instead of erroring', async () => {
    const response = await createApp().request('/api/v1/cities/search?q=i', {}, createTestEnv());
    await expect(response.json()).resolves.toEqual({ cities: [] });
  });

  it('returns an empty list when q is omitted', async () => {
    const response = await createApp().request('/api/v1/cities/search', {}, createTestEnv());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cities: [] });
  });

  it('clamps an oversized limit instead of returning everything', async () => {
    const response = await createApp().request('/api/v1/cities/search?q=a&limit=99999', {}, createTestEnv());
    const body = (await response.json()) as { cities: unknown[] };

    expect(body.cities.length).toBeLessThanOrEqual(20);
  });

  it('ignores a non-numeric limit and falls back to the default', async () => {
    const response = await createApp().request('/api/v1/cities/search?q=an&limit=not-a-number', {}, createTestEnv());
    expect(response.status).toBe(200);
  });
});
