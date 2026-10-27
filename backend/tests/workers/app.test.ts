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
    expect(html).toContain(path === '/privacy' ? '26 October 2026' : '5 August 2026');
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
    expect(html).toContain('27 October 2026');
    expect(html).toContain('şifreli kaydedilmiş doğum profili');
    expect(html).toContain('uygulamayı yeniden yüklemeden');
    expect(html).toContain('without reinstalling the app');
    expect(html).toContain('anonim Firebase oturumu');
    expect(html).toContain('No account is erased solely on an unverified email claim');
    expect(html).toContain('giriş kodu, oturum/Firebase belirteci');
    expect(html).toContain('Never email passwords, sign-in codes, session/Firebase');
    expect(html).toContain('mailto:info@parsfilo.com?subject=Astroloji%20account%20deletion');
  });

  it.each([
    {
      path: '/privacy',
      expected: [
        "Google Play'de dağıtılmış eski uygulama",
        "Firebase Analytics'e geçmişte",
        'sürümlerde bu seçenek bulunmayabilir',
        'Ruh hâli geçmişinin hesaba dokunmadan silinmesi',
        'mailto:info@parsfilo.com?subject=Astroloji%20veri%20silme%20talebi'
      ]
    },
    {
      path: '/delete-account',
      expected: [
        'Hesabı koruyarak belirli verilerin silinmesi',
        'Hesabı ve verileri sil',
        'Older distributed versions',
        'Eski sürümlerde bu seçenekler görünmeyebilir',
        'app-owned mood event history',
        'subject=Astroloji%20belirli%20veri%20silme%20talebi'
      ]
    }
  ])('describes version-aware data deletion at $path', async ({ path, expected }) => {
    const response = await createApp().request(path, {}, createTestEnv());
    const html = await response.text();

    expect(response.status).toBe(200);
    for (const text of expected) {
      expect(html).toContain(text);
    }
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

  it.each([
    {
      eventType: 'mood_logged',
      incoming: { mood: 'stressed', source: 'home', arbitrary: 'personal information' },
      expected: '{}'
    },
    {
      eventType: 'app_open',
      incoming: { source: 'home' },
      expected: '{"source":"home"}'
    }
  ])('minimizes %s events before they are persisted in D1', async ({ eventType, incoming, expected }) => {
    let storedMeta: string | undefined;
    const env = createTestEnv({
      DB: {
        prepare(sql: string) {
          const statement = {
            bind(...values: unknown[]) {
              if (sql.includes('INSERT INTO user_events')) {
                storedMeta = values[3] as string;
              }
              return statement;
            },
            async first() {
              return { ok: 1 };
            },
            async run() {
              return { success: true };
            }
          };
          return statement;
        }
      } as unknown as D1Database
    });
    const jwt = await signAppJwt(env, { userId: 'user-1', isPremium: false });
    const response = await createApp().request(
      '/api/v1/events/track',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ event_type: eventType, meta: incoming })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(storedMeta).toBe(expected);
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
    expect(html).toContain('Kaydedilen doğum profili (isteğe bağlı)');
    expect(html).toContain('İsteğe bağlı ruh hâli kayıtları');
    expect(html).toContain('mood_logged');
    expect(html).toContain("Firebase Analytics'e geçmişte");
    expect(html).toContain('Older distributed app versions may send');
    expect(html).toContain('earlier Firebase Analytics events');
    expect(html).toContain('older distributed versions may lack the control');
    expect(html).toContain('can remove account-linked mood check-ins');
    expect(html).toContain('does not delete historical Firebase Analytics events');
    expect(html).toContain('Optional mood check-ins');
    expect(html).toContain('until account deletion or account-preserving mood-history deletion');
    expect(html).toContain('AI sohbet mesajları');
    expect(html).toContain('doğum profilinden hesaplanan harita özeti');
    expect(html).toContain('Sun, Moon, Venus and Mars signs/degrees');
    expect(html).toContain('sunucu veritabanında şifreli biçimde saklanabilir');
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
