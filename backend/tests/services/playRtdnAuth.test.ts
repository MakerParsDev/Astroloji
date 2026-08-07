import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';

import { requirePlayWebhookAuth } from '@/middleware/auth';
import { verifyPlayRtdnIdentity } from '@/services/playRtdnAuth';
import type { AppContext, Env } from '@/types';
import { createTestEnv } from '../helpers/env';

const AUDIENCE = 'https://example.test/api/v1/webhooks/play-rtdn';
const CALLER = 'play-rtdn-push@example-project.iam.gserviceaccount.com';
const ISSUER = 'https://accounts.google.com';

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let jwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
});

afterEach(() => {
  vi.restoreAllMocks();
});interface TokenOptions {
  issuer?: string;
  audience?: string;
  expiration?: string | number;
  email?: string;
  emailVerified?: boolean;
  kid?: string | null;
}

async function signGoogleToken(options: TokenOptions = {}) {
  const token = new SignJWT({
    email: options.email ?? CALLER,
    email_verified: options.emailVerified ?? true
  })
    .setProtectedHeader(
      options.kid === null
        ? { alg: 'RS256', typ: 'JWT' }
        : { alg: 'RS256', kid: options.kid ?? 'test-key', typ: 'JWT' }
    )
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiration ?? '5m');
  return token.sign(privateKey);
}

function verifierDependencies() {
  return { resolveVerificationKey: vi.fn(async () => publicKey) };
}function createCache(initial: string | null = null) {
  let stored = initial;
  return {
    async get() {
      return stored;
    },
    async put(_key: string, value: string) {
      stored = value;
    },
    async delete() {
      stored = null;
    }
  } as unknown as KVNamespace;
}

function createAuthContext(input: {
  authorization?: string;
  queryToken?: string;
  headerSecret?: string;
  env?: Env;
}) {
  const query = input.queryToken ? `?token=${encodeURIComponent(input.queryToken)}` : '';
  const headers = new Headers();
  if (input.authorization) headers.set('authorization', input.authorization);
  if (input.headerSecret) headers.set('x-play-secret', input.headerSecret);
  const request = new Request(`https://example.test/api/v1/webhooks/play-rtdn${query}`, { headers });
  return {
    env: input.env ?? createTestEnv(),
    req: {
      url: request.url,
      header(name: string) {
        return request.headers.get(name) ?? undefined;
      }
    },
    json(body: unknown, init: number | { status: number }) {
      const status = typeof init === 'number' ? init : init.status;
      return Response.json(body, { status });
    }
  } as unknown as AppContext;
}describe('verifyPlayRtdnIdentity', () => {
  it('accepts a valid Google-signed identity for the configured audience and caller', async () => {
    const token = await signGoogleToken();
    const dependencies = verifierDependencies();

    await expect(
      verifyPlayRtdnIdentity(createTestEnv(), token, dependencies)
    ).resolves.toBeUndefined();
    expect(dependencies.resolveVerificationKey).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong issuer', { issuer: 'https://example.invalid' }],
    ['wrong audience', { audience: 'https://example.test/wrong' }],
    ['expired token', { expiration: Math.floor(Date.now() / 1000) - 60 }],
    ['wrong caller email', { email: 'other@example-project.iam.gserviceaccount.com' }],
    ['unverified caller email', { emailVerified: false }]
  ] as const)('rejects %s', async (_name, options) => {
    const token = await signGoogleToken(options);
    await expect(
      verifyPlayRtdnIdentity(createTestEnv(), token, verifierDependencies())
    ).rejects.toThrow();
  });

  it('rejects a token without kid before accepting its signature', async () => {
    const token = await signGoogleToken({ kid: null });
    await expect(
      verifyPlayRtdnIdentity(createTestEnv(), token, verifierDependencies())
    ).rejects.toThrow();
  });
  it('rejects a malformed JWT', async () => {
    await expect(
      verifyPlayRtdnIdentity(createTestEnv(), 'not-a-jwt', verifierDependencies())
    ).rejects.toThrow();
  });

  it('uses cached Google JWKS without a network request', async () => {
    const token = await signGoogleToken();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const env = createTestEnv({
      CACHE: createCache(JSON.stringify({ keys: [jwk] }))
    });

    await expect(verifyPlayRtdnIdentity(env, token)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes Google JWKS exactly once when cached kid is unknown', async () => {
    const token = await signGoogleToken();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ keys: [jwk] })
    );
    const env = createTestEnv({
      CACHE: createCache(JSON.stringify({ keys: [{ ...jwk, kid: 'stale-key' }] }))
    });

    await expect(verifyPlayRtdnIdentity(env, token)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fails closed when kid is unresolved after one refresh', async () => {
    const token = await signGoogleToken();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ keys: [{ ...jwk, kid: 'still-wrong' }] })
    );
    const env = createTestEnv({
      CACHE: createCache(JSON.stringify({ keys: [{ ...jwk, kid: 'stale-key' }] }))
    });

    await expect(verifyPlayRtdnIdentity(env, token)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('requirePlayWebhookAuth Phase A compatibility', () => {
  it('accepts a valid bearer through OIDC', async () => {
    const verifyIdentity = vi.fn(async () => undefined);
    const result = await requirePlayWebhookAuth(
      createAuthContext({ authorization: 'Bearer signed-token' }),
      verifyIdentity
    );

    expect(result).toEqual({ method: 'oidc' });
    expect(verifyIdentity).toHaveBeenCalledTimes(1);
  });
  it('accepts the legacy secret only when no bearer is present', async () => {
    const verifyIdentity = vi.fn(async () => undefined);
    const result = await requirePlayWebhookAuth(
      createAuthContext({ queryToken: 'play-secret' }),
      verifyIdentity
    );

    expect(result).toEqual({ method: 'legacy' });
    expect(verifyIdentity).not.toHaveBeenCalled();
  });

  it('does not downgrade an invalid bearer to a valid legacy secret', async () => {
    const verifyIdentity = vi.fn(async () => {
      throw new Error('invalid identity');
    });
    const result = await requirePlayWebhookAuth(
      createAuthContext({ authorization: 'Bearer invalid', queryToken: 'play-secret' }),
      verifyIdentity
    );

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(verifyIdentity).toHaveBeenCalledTimes(1);
  });

  it('rejects requests without bearer or a valid legacy secret', async () => {
    const result = await requirePlayWebhookAuth(createAuthContext({}));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
});