import type { Env } from '@/types';

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement;
          },
          async first() {
            return sql.replace(/\s+/g, ' ').trim().startsWith('SELECT 1') ? { ok: 1 } : null;
          },
          async all() {
            return { results: [] };
          },
          async run() {
            return { success: true, meta: {} };
          }
        };
        return statement;
      },
      async batch() {
        return [];
      }
    } as unknown as D1Database,
    CONTENT: {
      async head() {
        return { size: 1 } as R2Object;
      },
      async get() {
        return null;
      }
    } as unknown as R2Bucket,
    CACHE: {
      async get() {
        return null;
      },
      async put() {
        return;
      },
      async delete() {
        return;
      }
    } as unknown as KVNamespace,
    ENVIRONMENT: 'test',
    PACKAGE_NAME: 'com.example.astrology',
    PREMIUM_MONTHLY_PRODUCT_ID: 'premium_monthly',
    PREMIUM_YEARLY_PRODUCT_ID: 'premium_yearly',
    ALLOWED_ORIGINS: 'https://yourdomain.com',
    JWT_SECRET: 'super-secret',
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
    ADMOB_REWARDED_ID: 'ca-app-pub-3940256099942544/5224354917',
    ...overrides
  };
}
