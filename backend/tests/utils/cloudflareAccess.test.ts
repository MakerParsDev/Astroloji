import { describe, expect, it, vi } from 'vitest';

const { jwtVerifyMock } = vi.hoisted(() => ({
  jwtVerifyMock: vi.fn()
}));

vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof import('jose')>('jose');
  return {
    ...actual,
    jwtVerify: jwtVerifyMock,
    importJWK: vi.fn().mockResolvedValue('fake-crypto-key')
  };
});

import { verifyCloudflareAccessJwt } from '@/utils/cloudflareAccess';
import { createTestEnv } from '../helpers/env';

function fakeToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-kid' })).toString('base64url');
  return `${header}.payload.signature`;
}

function mockJwksResponse() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ keys: [{ kid: 'test-kid', kty: 'RSA', alg: 'RS256', e: 'AQAB', n: 'fake-n' }] })
  );
}

describe('verifyCloudflareAccessJwt', () => {
  it('verifies signature, issuer, and the given audience, then returns the email claim', async () => {
    const env = createTestEnv();
    mockJwksResponse();
    jwtVerifyMock.mockResolvedValue({ payload: { email: 'oaslananka@gmail.com' } });

    const identity = await verifyCloudflareAccessJwt(
      env,
      fakeToken(),
      'oaslananka.cloudflareaccess.com',
      'test-aud-123'
    );

    expect(identity).toEqual({ email: 'oaslananka@gmail.com' });
    expect(jwtVerifyMock).toHaveBeenCalledWith(
      expect.any(String),
      'fake-crypto-key',
      expect.objectContaining({
        algorithms: ['RS256'],
        issuer: 'https://oaslananka.cloudflareaccess.com',
        audience: 'test-aud-123'
      })
    );
  });

  it('throws when the token has no email claim', async () => {
    const env = createTestEnv();
    mockJwksResponse();
    jwtVerifyMock.mockResolvedValue({ payload: {} });

    await expect(
      verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123')
    ).rejects.toThrow('Cloudflare Access token is missing an email claim.');
  });

  it('propagates signature/issuer/audience verification failures', async () => {
    const env = createTestEnv();
    mockJwksResponse();
    jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

    await expect(
      verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123')
    ).rejects.toThrow();
  });

  it('caches the JWKS in KV and does not re-fetch on a subsequent call with a cached kid', async () => {
    const env = createTestEnv();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ keys: [{ kid: 'test-kid', kty: 'RSA', alg: 'RS256', e: 'AQAB', n: 'fake-n' }] })
    );
    jwtVerifyMock.mockResolvedValue({ payload: { email: 'oaslananka@gmail.com' } });

    await verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123');
    await verifyCloudflareAccessJwt(env, fakeToken(), 'oaslananka.cloudflareaccess.com', 'test-aud-123');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
