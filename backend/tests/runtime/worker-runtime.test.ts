import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unstable_dev } from 'wrangler';

let worker: Awaited<ReturnType<typeof unstable_dev>>;

describe('worker runtime routes', () => {
  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      config: 'wrangler.toml',
      local: true,
      experimental: {
        disableExperimentalWarning: true
      },
      vars: {
        JWT_SECRET: 'runtime-jwt-secret',
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: 'play@example.iam.gserviceaccount.com',
          private_key: 'FAKE_TEST_PLAY_PRIVATE_KEY',
          token_uri: 'https://oauth2.googleapis.com/token',
          project_id: 'demo-project'
        }),
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
          client_email: 'firebase@example.iam.gserviceaccount.com',
          private_key: 'FAKE_TEST_FIREBASE_PRIVATE_KEY',
          token_uri: 'https://oauth2.googleapis.com/token',
          project_id: 'demo-project'
        }),
        PLAY_WEBHOOK_SECRET: 'play-secret',
        ADMIN_SECRET: 'admin-secret',
        ADMOB_REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917'
      }
    });
  }, 120_000);

  afterAll(async () => {
    await worker?.stop();
  });

  it('rejects notification sends without the admin secret', async () => {
    const response = await worker.fetch('http://127.0.0.1/api/v1/notifications/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(403);
  });

  it('accepts the admin secret and then validates the body', async () => {
    const response = await worker.fetch('http://127.0.0.1/api/v1/notifications/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-secret': 'admin-secret'
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
  });

  it('keeps the AdMob SSV callback public but rejects malformed callbacks', async () => {
    const response = await worker.fetch('http://127.0.0.1/api/v1/rewards/ssv?invalid=1');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MALFORMED_CALLBACK' }
    });
  });

  it('accepts the play webhook secret and validates RTDN payload shape', async () => {
    const response = await worker.fetch('http://127.0.0.1/api/v1/webhooks/play-rtdn', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-play-secret': 'play-secret'
      },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
  });
});
