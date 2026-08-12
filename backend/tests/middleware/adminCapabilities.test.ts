import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  contentCacheBypassMiddleware,
  requireAdminCapability
} from '@/middleware/auth';
import type { AdminCapability, AdminOperation, AppBindings } from '@/types';
import { createTestEnv } from '../helpers/env';

const scopedSecrets: Record<AdminCapability, string> = {
  'content-ops': 'content-secret',
  'notification-ops': 'notification-secret',
  'play-read': 'play-read-secret',
  'play-write': 'play-write-secret',
  'admin-panel': 'ops@example.com'
};

function env() {
  return createTestEnv({
    ADMIN_CONTENT_SECRET: scopedSecrets['content-ops'],
    ADMIN_NOTIFICATION_SECRET: scopedSecrets['notification-ops'],
    ADMIN_PLAY_READ_SECRET: scopedSecrets['play-read'],
    ADMIN_PLAY_WRITE_SECRET: scopedSecrets['play-write']
  });
}

function protectedApp(
  capability: AdminCapability,
  operation: AdminOperation,
  status = 200
) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'request-123');
    c.set('bypassCache', false);
    await next();
  });
  app.get('/protected', requireAdminCapability(capability, operation), (c) =>
    c.json({ ok: status < 400 }, status as 200 | 400 | 500)
  );
  return app;
}

function adminEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map(([entry]) => entry)
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      'event' in entry &&
      (entry as Record<string, unknown>).event === 'admin_operation'
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireAdminCapability', () => {
  it('authorizes the matching scoped credential and emits sanitized audit events', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await protectedApp('content-ops', 'content.backfill').request(
      '/protected',
      { headers: { 'x-admin-secret': scopedSecrets['content-ops'] } },
      env()
    );

    expect(response.status).toBe(200);
    const events = adminEvents(log);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      event: 'admin_operation',
      requestId: 'request-123',
      capability: 'content-ops',
      operation: 'content.backfill',
      outcome: 'authorized'
    });
    expect(events[1]?.outcome).toBe('completed');
    expect(Object.keys(events[0] ?? {}).sort()).toEqual([
      'capability', 'event', 'operation', 'outcome', 'requestId'
    ]);
    expect(JSON.stringify(events)).not.toContain(scopedSecrets['content-ops']);
  });

  it.each([
    'notification-ops',
    'play-read',
    'play-write'
  ] as const)('rejects a %s credential at the content boundary', async (wrongCapability) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await protectedApp('content-ops', 'content.backfill').request(
      '/protected',
      { headers: { 'x-admin-secret': scopedSecrets[wrongCapability] } },
      env()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(adminEvents(log)).toEqual([
      {
        event: 'admin_operation',
        requestId: 'request-123',
        capability: 'content-ops',
        operation: 'content.backfill',
        outcome: 'rejected'
      }
    ]);
  });

  it('rejects the historical legacy admin credential', async () => {
    const response = await protectedApp('play-write', 'play.subscription_update').request(
      '/protected',
      { headers: { 'x-admin-secret': 'legacy-admin-secret' } },
      env()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it.each([undefined, 'wrong-secret'])('rejects missing or invalid credentials', async (secret) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const headers = secret ? { 'x-admin-secret': secret } : undefined;
    const response = await protectedApp('play-read', 'play.review_list').request(
      '/protected',
      { headers },
      env()
    );

    expect(response.status).toBe(403);
    expect(adminEvents(log).map((event) => event.outcome)).toEqual(['rejected']);
  });

  it('classifies downstream validation and server failures as failed, never completed', async () => {
    for (const status of [400, 500]) {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const response = await protectedApp('notification-ops', 'notification.send', status).request(
        '/protected',
        { headers: { 'x-admin-secret': scopedSecrets['notification-ops'] } },
        env()
      );

      expect(response.status).toBe(status);
      expect(adminEvents(log).map((event) => event.outcome)).toEqual(['authorized', 'failed']);
      log.mockRestore();
    }
  });
});

describe('contentCacheBypassMiddleware', () => {
  function cacheApp() {
    const app = new Hono<AppBindings>();
    app.use('*', async (c, next) => {
      c.set('requestId', 'cache-request');
      c.set('bypassCache', false);
      await next();
    });
    app.use('/content', contentCacheBypassMiddleware);
    app.get('/content', (c) => c.json({ bypassCache: c.get('bypassCache') }));
    return app;
  }

  it('continues normally without admin auth when bypass is not requested', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await cacheApp().request('/content', {}, env());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bypassCache: false });
    expect(adminEvents(log)).toEqual([]);
  });

  it('requires content-ops when bypass is explicitly requested', async () => {
    const response = await cacheApp().request(
      '/content',
      { headers: { 'x-cache-bypass': 'true' } },
      env()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('enables bypass with the content scoped credential and sanitizes audit fields', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await cacheApp().request(
      '/content',
      {
        headers: {
          'x-cache-bypass': 'true',
          'x-admin-secret': scopedSecrets['content-ops']
        }
      },
      env()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ bypassCache: true });
    const events = adminEvents(log);
    expect(events.map((event) => event.outcome)).toEqual(['authorized', 'completed']);
    expect(events.every((event) => event.operation === 'content.cache_bypass')).toBe(true);
    expect(JSON.stringify(events)).not.toContain(scopedSecrets['content-ops']);
  });

  it('rejects the historical legacy credential for cache bypass', async () => {
    const response = await cacheApp().request(
      '/content',
      {
        headers: {
          'x-cache-bypass': 'true',
          'x-admin-secret': 'legacy-admin-secret'
        }
      },
      env()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
  });
});
