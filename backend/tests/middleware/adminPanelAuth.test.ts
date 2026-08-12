import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { verifyAdminPanelIdentityMock } = vi.hoisted(() => ({
  verifyAdminPanelIdentityMock: vi.fn()
}));

vi.mock('@/utils/jwt', async () => {
  const actual = await vi.importActual<typeof import('@/utils/jwt')>('@/utils/jwt');
  return {
    ...actual,
    verifyAdminPanelIdentity: verifyAdminPanelIdentityMock
  };
});

import { requireAdminPanelAuth } from '@/middleware/auth';
import type { AppBindings } from '@/types';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv({ ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com, second@example.com' });
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
  verifyAdminPanelIdentityMock.mockReset();
});

describe('requireAdminPanelAuth', () => {
  it('authorizes a verified, allowlisted identity and emits sanitized audit events', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-1',
      email: 'ops@example.com',
      emailVerified: true
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );

    expect(response.status).toBe(200);
    const events = adminEvents(log);
    expect(events.map((event) => event.outcome)).toEqual(['authorized', 'completed']);
    expect(events.every((event) => event.capability === 'admin-panel' && event.operation === 'panel.health')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('ops@example.com');
    expect(JSON.stringify(events)).not.toContain('test-token');
  });

  it('rejects with 401 when the authorization header is missing', async () => {
    const response = await protectedApp().request('/protected', {}, env());
    expect(response.status).toBe(401);
    expect(verifyAdminPanelIdentityMock).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token verification fails', async () => {
    verifyAdminPanelIdentityMock.mockRejectedValue(new Error('token expired'));
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer bad-token' } },
      env()
    );
    expect(response.status).toBe(401);
  });

  it('rejects with 403 when the email is not in the allowlist', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-2',
      email: 'stranger@example.com',
      emailVerified: true
    });
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );
    expect(response.status).toBe(403);
  });

  it('rejects with 403 when the email is not verified', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-3',
      email: 'ops@example.com',
      emailVerified: false
    });
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );
    expect(response.status).toBe(403);
  });

  it('rejects with 403, not 500, when ADMIN_PANEL_ALLOWED_EMAILS is unset', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-4',
      email: 'ops@example.com',
      emailVerified: true
    });
    const response = await protectedApp().request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      createTestEnv({ ADMIN_PANEL_ALLOWED_EMAILS: undefined as unknown as string })
    );
    expect(response.status).toBe(403);
  });

  it('classifies downstream failures as failed, never completed', async () => {
    verifyAdminPanelIdentityMock.mockResolvedValue({
      sub: 'panel-uid-1',
      email: 'ops@example.com',
      emailVerified: true
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await protectedApp(500).request(
      '/protected',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );

    expect(response.status).toBe(500);
    expect(adminEvents(log).map((event) => event.outcome)).toEqual(['authorized', 'failed']);
  });
});
