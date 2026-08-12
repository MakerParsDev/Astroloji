import { describe, expect, it, vi } from 'vitest';

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
    jwtVerify: jwtVerifyMock,
    importX509: vi.fn().mockResolvedValue('fake-crypto-key')
  };
});

import { verifyFirebaseIdToken } from '@/utils/jwt';
import { createTestEnv } from '../helpers/env';

function fakeToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString('base64url');
  return `${header}.payload.signature`;
}

function mockCertResponse() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ 'test-kid': '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----' })
  );
}

describe('verifyFirebaseIdToken', () => {
  it('verifies against the app\'s own FIREBASE_SERVICE_ACCOUNT_JSON project, unchanged', async () => {
    const env = createTestEnv();
    mockCertResponse();
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'app-user-1', aud: 'demo-project', iss: 'https://securetoken.google.com/demo-project' }
    });

    const claims = await verifyFirebaseIdToken(env, fakeToken());

    expect(claims).toEqual({
      aud: 'demo-project',
      iss: 'https://securetoken.google.com/demo-project',
      sub: 'app-user-1',
      user_id: undefined,
      firebase: undefined
    });
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      'fake-crypto-key',
      expect.objectContaining({
        issuer: 'https://securetoken.google.com/demo-project',
        audience: 'demo-project'
      })
    );
  });
});
