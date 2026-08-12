import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose';

interface CloudflareAccessJwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface CloudflareAccessJwksResponse {
  keys: CloudflareAccessJwk[];
}

function jwksCacheKey(teamDomain: string): string {
  return `cloudflare_access_jwks_${teamDomain}`;
}

const ACCESS_JWKS_CACHE_TTL_SECONDS = 3600; // 1 hour

async function fetchAccessJwks(teamDomain: string): Promise<CloudflareAccessJwksResponse> {
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) {
    throw new Error('Unable to fetch Cloudflare Access verification certificates.');
  }
  return (await response.json()) as CloudflareAccessJwksResponse;
}

async function resolveAccessVerificationKey(
  env: { CACHE: KVNamespace },
  teamDomain: string,
  token: string
): Promise<CryptoKey> {
  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new Error('Cloudflare Access token is missing a kid header.');
  }

  const cacheKey = jwksCacheKey(teamDomain);
  const cached = await env.CACHE.get(cacheKey);
  let jwks: CloudflareAccessJwksResponse;

  if (cached) {
    jwks = JSON.parse(cached) as CloudflareAccessJwksResponse;
  } else {
    jwks = await fetchAccessJwks(teamDomain);
    await env.CACHE.put(cacheKey, JSON.stringify(jwks), { expirationTtl: ACCESS_JWKS_CACHE_TTL_SECONDS });
  }

  let jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // kid not found in cache — force refresh once
    jwks = await fetchAccessJwks(teamDomain);
    await env.CACHE.put(cacheKey, JSON.stringify(jwks), { expirationTtl: ACCESS_JWKS_CACHE_TTL_SECONDS });
    jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (!jwk) {
      throw new Error('Unable to resolve Cloudflare Access verification key.');
    }
  }

  return importJWK({ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' }, 'RS256') as Promise<CryptoKey>;
}

/**
 * Verifies a Cloudflare Access JWT (the `Cf-Access-Jwt-Assertion` header
 * value Cloudflare's edge injects after a successful Access login) against
 * one specific Access Application's audience. A token that verifies is
 * sufficient proof of authorization — Access's own policy already gated the
 * login; callers should not layer an additional allowlist check on top.
 */
export async function verifyCloudflareAccessJwt(
  env: { CACHE: KVNamespace },
  token: string,
  teamDomain: string,
  expectedAud: string
): Promise<{ email: string }> {
  const key = await resolveAccessVerificationKey(env, teamDomain, token);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    issuer: `https://${teamDomain}`,
    audience: expectedAud
  });

  const email = payload.email;
  if (typeof email !== 'string' || !email) {
    throw new Error('Cloudflare Access token is missing an email claim.');
  }

  return { email };
}
