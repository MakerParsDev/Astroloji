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

import { verifyAdminPanelIdentity, verifyFirebaseIdToken } from '@/utils/jwt';
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

describe('verifyAdminPanelIdentity', () => {
  it('verifies against ADMIN_PANEL_FIREBASE_PROJECT_ID, not the app Firebase project', async () => {
    const env = createTestEnv({ ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project' });
    mockCertResponse();
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'panel-user-1', email: 'ops@example.com', email_verified: true }
    });

    const identity = await verifyAdminPanelIdentity(env, fakeToken());

    expect(identity).toEqual({ sub: 'panel-user-1', email: 'ops@example.com', emailVerified: true });
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      'fake-crypto-key',
      expect.objectContaining({
        algorithms: ['RS256'],
        issuer: 'https://securetoken.google.com/panel-project',
        audience: 'panel-project'
      })
    );
  });

  it('defaults email to undefined and emailVerified to false when the claims omit them', async () => {
    const env = createTestEnv({ ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project' });
    mockCertResponse();
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'panel-user-2' } });

    const identity = await verifyAdminPanelIdentity(env, fakeToken());

    expect(identity).toEqual({ sub: 'panel-user-2', email: undefined, emailVerified: false });
  });

  it('propagates verification failures (expired token, bad signature)', async () => {
    const env = createTestEnv({ ADMIN_PANEL_FIREBASE_PROJECT_ID: 'panel-project' });
    mockCertResponse();
    jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

    await expect(verifyAdminPanelIdentity(env, fakeToken())).rejects.toThrow();
  });
});

describe('verifyFirebaseIdToken (regression)', () => {
  it('still verifies against the app\'s own FIREBASE_SERVICE_ACCOUNT_JSON project, unchanged', async () => {
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
