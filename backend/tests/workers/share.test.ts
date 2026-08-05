import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

describe('public share landing pages', () => {
  it('renders an anonymous daily landing page with app and store actions', async () => {
    const response = await createApp().request('/share/daily/aries', {}, createTestEnv());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(html).toContain('astrology://daily/aries');
    expect(html).toContain('https://play.google.com/store/apps/details?id=com.parsfilo.astrology');
    expect(html).not.toContain('user_id');
    expect(html).not.toContain('utm_');
  });

  it('canonicalizes compatibility pairs without exposing a mutable score', async () => {
    const response = await createApp().request('/share/compat/leo/aries', {}, createTestEnv());

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/share/compat/aries/leo');

    const canonical = await createApp().request('/share/compat/aries/leo', {}, createTestEnv());
    const html = await canonical.text();
    expect(canonical.status).toBe(200);
    expect(html).toContain('Aries + Leo');
    expect(html).not.toMatch(/\b\d{1,3}%/);
  });

  it('rejects invalid signs and extra path segments', async () => {
    expect((await createApp().request('/share/daily/invalid', {}, createTestEnv())).status).toBe(404);
    expect((await createApp().request('/share/daily/aries/extra', {}, createTestEnv())).status).toBe(404);
    expect((await createApp().request('/share/compat/aries/invalid', {}, createTestEnv())).status).toBe(404);
  });
});
