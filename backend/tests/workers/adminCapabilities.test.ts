import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

const { listPlaySubscriptionsMock, listPlayReviewsMock } = vi.hoisted(() => ({
  listPlaySubscriptionsMock: vi.fn(async () => []),
  listPlayReviewsMock: vi.fn(async () => [])
}));

vi.mock('@/services/playBilling', async () => {
  const actual = await vi.importActual<typeof import('@/services/playBilling')>(
    '@/services/playBilling'
  );
  return {
    ...actual,
    listPlaySubscriptions: listPlaySubscriptionsMock,
    listPlayReviews: listPlayReviewsMock
  };
});

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

const credentials = {
  content: 'content-secret',
  notification: 'notification-secret',
  playRead: 'play-read-secret',
  playWrite: 'play-write-secret',
  legacy: 'admin-secret'
} as const;

async function request(
  path: string,
  options: {
    method?: string;
    secret?: string;
    body?: string;
  } = {}
) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.secret) headers['x-admin-secret'] = options.secret;
  return createApp().request(
    path,
    {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: options.body })
    },
    createTestEnv()
  );
}

async function expectWrongSecret403(
  path: string,
  options: { method?: string; body?: string; wrongSecret: string }
) {
  const response = await request(path, {
    method: options.method,
    body: options.body,
    secret: options.wrongSecret
  });
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } });
}

describe('admin route capability matrix', () => {
  it('binds content backfill to content-ops', async () => {
    const allowed = await request('/api/v1/admin/content/backfill', {
      method: 'POST', secret: credentials.content, body: 'not-json'
    });
    expect(allowed.status).toBe(400);
    await expectWrongSecret403('/api/v1/admin/content/backfill', {
      method: 'POST', body: 'not-json', wrongSecret: credentials.notification
    });
  });

  it('binds notification send to notification-ops', async () => {
    const allowed = await request('/api/v1/notifications/send', {
      method: 'POST', secret: credentials.notification, body: 'not-json'
    });
    expect(allowed.status).toBe(400);
    await expectWrongSecret403('/api/v1/notifications/send', {
      method: 'POST', body: 'not-json', wrongSecret: credentials.content
    });
  });

  it('binds Play subscription listing to play-read', async () => {
    const allowed = await request('/api/v1/admin/play/subscriptions', {
      secret: credentials.playRead
    });
    expect(allowed.status).toBe(200);
    expect(listPlaySubscriptionsMock).toHaveBeenCalled();
    await expectWrongSecret403('/api/v1/admin/play/subscriptions', {
      wrongSecret: credentials.playWrite
    });
  });

  it('binds Play review listing to play-read', async () => {
    const allowed = await request('/api/v1/admin/play/reviews', {
      secret: credentials.playRead
    });
    expect(allowed.status).toBe(200);
    expect(listPlayReviewsMock).toHaveBeenCalled();
    await expectWrongSecret403('/api/v1/admin/play/reviews', {
      wrongSecret: credentials.playWrite
    });
  });

  it('binds Play subscription mutation to play-write', async () => {
    const allowed = await request('/api/v1/admin/play/subscriptions/verification-id', {
      method: 'PATCH', secret: credentials.playWrite, body: '{}'
    });
    expect(allowed.status).toBe(400);
    await expectWrongSecret403('/api/v1/admin/play/subscriptions/verification-id', {
      method: 'PATCH', body: '{}', wrongSecret: credentials.playRead
    });
  });

  it('binds the mutating subscription audit to play-write', async () => {
    const allowed = await request('/api/v1/admin/subscriptions/audit', {
      secret: credentials.playWrite
    });
    expect(allowed.status).toBe(200);
    await expectWrongSecret403('/api/v1/admin/subscriptions/audit', {
      wrongSecret: credentials.playRead
    });
  });

  it('binds Play review reply to play-write', async () => {
    const allowed = await request('/api/v1/admin/play/reviews/review-id/reply', {
      method: 'POST', secret: credentials.playWrite, body: '{}'
    });
    expect(allowed.status).toBe(400);
    await expectWrongSecret403('/api/v1/admin/play/reviews/review-id/reply', {
      method: 'POST', body: '{}', wrongSecret: credentials.playRead
    });
  });

  it('keeps the legacy credential as Phase A compatibility across a scoped route', async () => {
    const response = await request('/api/v1/notifications/send', {
      method: 'POST', secret: credentials.legacy, body: 'not-json'
    });
    expect(response.status).toBe(400);
  });

  it('removes the callable global admin middleware from active source', () => {
    const indexSource = readFileSync('src/index.ts', 'utf8');
    const authSource = readFileSync('src/middleware/auth.ts', 'utf8');
    expect(indexSource).not.toContain('adminSecretMiddleware');
    expect(authSource).not.toContain('export const adminSecretMiddleware');
  });
});
