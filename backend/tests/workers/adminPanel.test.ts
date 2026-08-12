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
