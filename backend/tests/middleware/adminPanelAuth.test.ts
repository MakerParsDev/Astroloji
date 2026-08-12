import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { verifyCloudflareAccessJwtMock } = vi.hoisted(() => ({
  verifyCloudflareAccessJwtMock: vi.fn()
}));

vi.mock('@/utils/cloudflareAccess', async () => {
  const actual = await vi.importActual<typeof import('@/utils/cloudflareAccess')>('@/utils/cloudflareAccess');
  return {
    ...actual,
    verifyCloudflareAccessJwt: verifyCloudflareAccessJwtMock
  };
});

import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings } from '@/types';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv();
}

function protectedApp(status = 200) {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'request-123');
    c.set('bypassCache', false);
    await next();
  });
  app.get('/protected', requireAdminPanelAuth('panel.health'), (c) =>
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
  verifyCloudflareAccessJwtMock.mockReset();
});

describe('requireAdminPanelAuth', () => {
  it('authorizes a valid Cloudflare Access token and emits sanitized audit events', async () => {
    verifyCloudflareAccessJwtMock.mockResolvedValue({ email: 'oaslananka@gmail.com' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp().request(
      '/protected',
      { headers: { 'cf-access-jwt-assertion': 'test-token' } },
      env()
    );

    expect(response.status).toBe(200);
    const events = adminEvents(log);
    expect(events.map((event) => event.outcome)).toEqual(['authorized', 'completed']);
    expect(events.every((event) => event.capability === 'admin-panel' && event.operation === 'panel.health')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('oaslananka@gmail.com');
    expect(JSON.stringify(events)).not.toContain('test-token');
  });

  it('rejects with 401 when the Cf-Access-Jwt-Assertion header is missing', async () => {
    const response = await protectedApp().request('/protected', {}, env());
    expect(response.status).toBe(401);
    expect(verifyCloudflareAccessJwtMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token verification fails (bad signature, wrong aud, expired)', async () => {
    verifyCloudflareAccessJwtMock.mockRejectedValue(new Error('signature verification failed'));
    const response = await protectedApp().request(
      '/protected',
      { headers: { 'cf-access-jwt-assertion': 'bad-token' } },
      env()
    );
    expect(response.status).toBe(401);
  });

  it('passes this backend\'s team domain and aud to the verifier', async () => {
    verifyCloudflareAccessJwtMock.mockResolvedValue({ email: 'oaslananka@gmail.com' });
    const testEnv = createTestEnv({
      ADMIN_PANEL_ACCESS_TEAM_DOMAIN: 'oaslananka.cloudflareaccess.com',
      ADMIN_PANEL_ACCESS_AUD: 'astroloji-specific-aud'
    });

    await protectedApp().request('/protected', { headers: { 'cf-access-jwt-assertion': 'test-token' } }, testEnv);

    expect(verifyCloudflareAccessJwtMock).toHaveBeenCalledWith(
      expect.anything(),
      'test-token',
      'oaslananka.cloudflareaccess.com',
      'astroloji-specific-aud'
    );
  });

  it('classifies downstream failures as failed, never completed', async () => {
    verifyCloudflareAccessJwtMock.mockResolvedValue({ email: 'oaslananka@gmail.com' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp(500).request(
      '/protected',
      { headers: { 'cf-access-jwt-assertion': 'test-token' } },
      env()
    );

    expect(response.status).toBe(500);
    expect(adminEvents(log).map((event) => event.outcome)).toEqual(['authorized', 'failed']);
  });
});
