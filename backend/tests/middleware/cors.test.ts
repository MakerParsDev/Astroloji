import { describe, expect, it } from 'vitest';

import { createApp } from '@/index';
import { createTestEnv } from '../helpers/env';

function env() {
  return createTestEnv({ ALLOWED_ORIGINS: 'https://astrology.parsfilo.com,https://admin.parsfilo.com' });
}

describe('corsMiddleware', () => {
  it('includes CORS headers on an OPTIONS preflight for an allowed origin', async () => {
    const app = createApp();

    const response = await app.request(
      '/api/v1/health',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://admin.parsfilo.com',
          'access-control-request-method': 'GET'
        }
      },
      env()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://admin.parsfilo.com');
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('omits CORS headers on an OPTIONS preflight for a non-allowed origin', async () => {
    const app = createApp();

    const response = await app.request(
      '/api/v1/health',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://not-allowed.example.com',
          'access-control-request-method': 'GET'
        }
      },
      env()
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('includes CORS headers on a normal GET response for an allowed origin', async () => {
    const app = createApp();

    const response = await app.request(
      '/api/v1/health',
      { headers: { origin: 'https://admin.parsfilo.com' } },
      env()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://admin.parsfilo.com');
  });
});
