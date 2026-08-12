import { describe, expect, it, vi } from 'vitest';

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

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv({ ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com' });
}

function authorize() {
  verifyAdminPanelIdentityMock.mockResolvedValue({
    sub: 'panel-uid-1',
    email: 'ops@example.com',
    emailVerified: true
  });
}

describe('GET /api/v1/admin/panel/health', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp();
    const response = await app.request('/api/v1/admin/panel/health', {}, env());
    expect(response.status).toBe(401);
  });

  it('reports db, kv, and llm provider chain composition when authorized', async () => {
    authorize();
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/panel/health',
      { headers: { authorization: 'Bearer test-token' } },
      env()
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      timestamp: string;
      db: boolean;
      kv: boolean;
      llmProviders: Record<string, string[]>;
    };
    expect(body).toMatchObject({
      status: 'ok',
      db: true,
      kv: true,
      llmProviders: {
        daily_content: ['workers-ai'],
        deep_reading: ['workers-ai'],
        chat_consultation: ['workers-ai']
      }
    });
    expect(typeof body.timestamp).toBe('string');
  });
});

describe('POST /api/v1/admin/panel/llm/test', () => {
  it('rejects unauthenticated requests', async () => {
    const app = createApp();
    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskType: 'daily_content' }) },
      env()
    );
    expect(response.status).toBe(401);
  });

  it('rejects an unknown taskType with 400', async () => {
    authorize();
    const app = createApp();
    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'not-a-real-task' })
      },
      env()
    );
    expect(response.status).toBe(400);
  });

  it('returns the provider fallback attempts when every provider fails', async () => {
    authorize();
    const failingEnv = createTestEnv({
      ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com',
      AI: {
        async run() {
          throw new Error('simulated provider outage');
        }
      } as unknown as ReturnType<typeof createTestEnv>['AI']
    });
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'daily_content' })
      },
      failingEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.succeeded).toBe(false);
    expect(body.providerId).toBeNull();
    expect(body.attempts).toEqual([{ providerId: 'workers-ai', error: expect.stringContaining('simulated provider outage') }]);
  });

  it('succeeds with a provider id, text, and usage when the chain responds, and never records budget usage', async () => {
    authorize();
    const cachePutSpy = vi.fn();
    const workingEnv = createTestEnv({
      ADMIN_PANEL_ALLOWED_EMAILS: 'ops@example.com',
      AI: {
        async run() {
          return { response: 'ok', usage: { prompt_tokens: 12, completion_tokens: 1 } };
        }
      } as unknown as ReturnType<typeof createTestEnv>['AI'],
      CACHE: {
        async get() {
          return null;
        },
        put: cachePutSpy,
        async delete() {
          return;
        }
      } as unknown as ReturnType<typeof createTestEnv>['CACHE']
    });
    const app = createApp();

    const response = await app.request(
      '/api/v1/admin/panel/llm/test',
      {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ taskType: 'deep_reading' })
      },
      workingEnv
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      succeeded: true,
      providerId: 'workers-ai',
      text: 'ok',
      usage: { inputTokens: 12, outputTokens: 1 },
      attempts: []
    });
    // routeLlmGenerate (not routeLlmGenerateForUser) never touches CACHE, so no budget
    // write can occur — this route must not record usage against any real user's cap.
    expect(cachePutSpy).not.toHaveBeenCalled();
  });
});
