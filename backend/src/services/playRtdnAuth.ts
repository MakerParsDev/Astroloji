import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

import type { Env } from '@/types';

const PLAY_RTDN_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const PLAY_RTDN_JWKS_CACHE_KEY = 'play_rtdn_google_jwks';
const PLAY_RTDN_JWKS_CACHE_TTL_SECONDS = 3600;
const PLAY_RTDN_JWKS_REFRESH_COOLDOWN_KEY = 'play_rtdn_google_jwks_refresh_cooldown';
const PLAY_RTDN_JWKS_REFRESH_COOLDOWN_SECONDS = 60;

interface PlayRtdnJwks {
  keys: Array<Record<string, unknown>>;
}

export interface PlayRtdnAuthDependencies {
  resolveVerificationKey?: (
    token: string,
    env: Pick<Env, 'CACHE'>
  ) => Promise<CryptoKey>;
}

function parseJwks(raw: string): PlayRtdnJwks {
  const parsed = JSON.parse(raw) as PlayRtdnJwks;
  if (!Array.isArray(parsed.keys)) {
    throw new Error('Google JWKS response is invalid.');
  }
  return parsed;
}
async function fetchGoogleJwks(env: Pick<Env, 'CACHE'>): Promise<PlayRtdnJwks> {
  const response = await fetch(PLAY_RTDN_JWKS_URL);
  if (!response.ok) {
    throw new Error('Unable to fetch Google verification keys.');
  }

  const jwks = parseJwks(await response.text());
  await env.CACHE.put(PLAY_RTDN_JWKS_CACHE_KEY, JSON.stringify(jwks), {
    expirationTtl: PLAY_RTDN_JWKS_CACHE_TTL_SECONDS
  });
  return jwks;
}

function findJwk(jwks: PlayRtdnJwks, kid: string) {
  return jwks.keys.find((candidate) => candidate.kid === kid);
}

async function resolveGoogleVerificationKey(
  token: string,
  env: Pick<Env, 'CACHE'>
): Promise<CryptoKey> {
  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new Error('Play RTDN identity token is missing kid.');
  }

  const cached = await env.CACHE.get(PLAY_RTDN_JWKS_CACHE_KEY);
  let jwks = cached ? parseJwks(cached) : await fetchGoogleJwks(env);
  let jwk = findJwk(jwks, header.kid);
  if (!jwk && cached) {
    const refreshCoolingDown = await env.CACHE.get(PLAY_RTDN_JWKS_REFRESH_COOLDOWN_KEY);
    if (!refreshCoolingDown) {
      await env.CACHE.put(PLAY_RTDN_JWKS_REFRESH_COOLDOWN_KEY, '1', {
        expirationTtl: PLAY_RTDN_JWKS_REFRESH_COOLDOWN_SECONDS
      });
      jwks = await fetchGoogleJwks(env);
      jwk = findJwk(jwks, header.kid);
    }
  }

  if (!jwk || jwk.kty !== 'RSA') {
    throw new Error('Unable to resolve Google verification key.');
  }

  return importJWK(jwk as JsonWebKey, 'RS256') as Promise<CryptoKey>;
}

export async function verifyPlayRtdnIdentity(
  env: Pick<Env, 'CACHE' | 'PLAY_RTDN_AUDIENCE' | 'PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'>,
  token: string,
  dependencies: PlayRtdnAuthDependencies = {}
): Promise<void> {
  if (!env.PLAY_RTDN_AUDIENCE || !env.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('Play RTDN identity configuration is missing.');
  }

  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new Error('Play RTDN identity token is missing kid.');
  }

  const resolveVerificationKey =
    dependencies.resolveVerificationKey ?? resolveGoogleVerificationKey;
  const key = await resolveVerificationKey(token, env);
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.PLAY_RTDN_AUDIENCE
  });

  if (
    payload.email !== env.PLAY_RTDN_SERVICE_ACCOUNT_EMAIL ||
    payload.email_verified !== true
  ) {
    throw new Error('Play RTDN caller identity is invalid.');
  }
}