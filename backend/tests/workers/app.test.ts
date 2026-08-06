import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { signAppJwt } from '@/utils/jwt';
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
    expect(html).toContain('5 August 2026');
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
    expect(html).toContain('5 August 2026');
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

  it('rejects a signed JWT after its user record has been deleted', async () => {
    let writes = 0;
    const env = createTestEnv({
      DB: {
        prepare() {
          const statement = {
            bind() {
              return statement;
            },
            async first() {
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              writes += 1;
              return { success: true, meta: { changes: 1 } };
            }
          };
          return statement;
        }
      } as unknown as D1Database
    });
    const jwt = await signAppJwt(env, { userId: 'deleted-user', isPremium: false });

    const response = await createApp().request(
      '/api/v1/events/track',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ event_type: 'app_open', meta: {} })
      },
      env
    );

    expect(response.status).toBe(401);
    expect(writes).toBe(0);
  });

  it('keeps privacy disclosures aligned with transient chart, feedback, and share behavior', async () => {
    const response = await createApp().request('/privacy', {}, createTestEnv());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('geçici (ephemeral) olarak');
    expect(html).toContain('kalıcı depolamaya yazılmaz');
    expect(html).toContain('yapılandırılmış günlük geri bildirim');
    expect(html.toLowerCase()).toContain('anonim paylaşım bağlantıları');
    expect(html).toContain('Personal Guidance');
    expect(html).not.toContain('Sunucuya gönderilen profil verisi doğum');
  });

  it('describes local feedback deletion and chart limitations in public legal pages', async () => {
    const deletion = await (await createApp().request('/delete-account', {}, createTestEnv())).text();
    const terms = await (await createApp().request('/terms', {}, createTestEnv())).text();

    expect(deletion).toContain('son günlük geri bildirim kategorisi');
    expect(terms).toContain('doğum tarihi tabanlı kişisel rehber');
    expect(terms).toContain('yükselen ve ev hesaplaması içermez');
  });

});
