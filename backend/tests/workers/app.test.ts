import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

describe('app routes', () => {
  it('returns health status when dependencies are reachable', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/health', {}, createTestEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok'
    });
  });

  it.each([
    ['/privacy', 'Gizlilik Politikası'],
    ['/terms', 'Kullanım Koşulları']
  ])('serves the public legal page at %s', async (path, heading) => {
    const app = createApp();
    const response = await app.request(path, {}, createTestEnv());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain(heading);
    expect(html).toContain('info@parsfilo.com');
    expect(html).toContain('20 July 2026');
  });

  it('serves public account deletion instructions', async () => {
    const app = createApp();
    const response = await app.request('/delete-account', {}, createTestEnv());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(html).toContain('Hesap ve Veri Silme');
    expect(html).toContain('Account and Data Deletion');
    expect(html).toContain('Google Play');
    expect(html).toContain('info@parsfilo.com');
    expect(html).toContain('20 July 2026');
  });

  it('requires firebase authorization for user registration', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/v1/users/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sign: 'aries',
          language: 'tr',
          fcm_token: 'token-1',
          notification_hour: 9,
          utc_offset: 3
        })
      },
      createTestEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing authorization header.'
      }
    });
  });

  it('returns a validation error when registration receives an empty json body', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/v1/users/register',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer invalid-token'
        },
        body: ''
      },
      createTestEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body must be valid JSON.'
      }
    });
  });
});
