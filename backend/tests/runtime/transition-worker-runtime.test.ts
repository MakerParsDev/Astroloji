import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

describe('reward transition worker runtime', () => {
  beforeAll(async () => {
    worker = await unstable_dev('src/transition/index.ts', {
      config: 'wrangler.transition.toml',
      local: true,
      experimental: { disableExperimentalWarning: true },
      vars: {
        JWT_SECRET: 'runtime-transition-jwt-secret',
        ADMOB_REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917',
        LEGACY_REWARD_FORWARD_UNTIL: '2026-08-09T00:00:00Z'
      }
    });
  }, 120_000);

  afterAll(async () => {
    await worker?.stop();
  });

  it('rejects malformed SSV publicly through the transition entrypoint', async () => {
    const response = await worker.fetch(
      'http://127.0.0.1/api/v1/rewards/ssv?preflight=invalid'
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MALFORMED_CALLBACK' }
    });
  });

  it('requires JWT for secure prepare', async () => {
    const response = await worker.fetch(
      'http://127.0.0.1/api/v1/rewards/prepare',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reward_type: 'daily',
          identifier: '2026-07-26'
        })
      }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' }
    });
  });

  it('does not serve a non-reward route', async () => {
    const response = await worker.fetch('http://127.0.0.1/api/v1/health');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' }
    });
  });

  it('rejects unsupported reward methods locally', async () => {
    const response = await worker.fetch(
      'http://127.0.0.1/api/v1/rewards/claim',
      { method: 'GET' }
    );

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'METHOD_NOT_ALLOWED' }
    });
  });
});
