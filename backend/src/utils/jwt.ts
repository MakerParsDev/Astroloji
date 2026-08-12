import {
  decodeProtectedHeader,
  importPKCS8,
  importX509,
  jwtVerify,
  SignJWT
} from 'jose';

import type { Env, FirebaseIdTokenClaims, GoogleServiceAccount, JwtClaims } from '@/types';

const FIREBASE_X509_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

function getGoogleServiceAccount(raw: string): GoogleServiceAccount {
  const parsed = JSON.parse(raw) as GoogleServiceAccount;
  if (!parsed.client_email || !parsed.private_key || !parsed.token_uri || !parsed.project_id) {
    throw new Error('Invalid service account JSON.');
  }
  return parsed;
}

async function importHs256Secret(secret: string): Promise<Uint8Array> {
  return new TextEncoder().encode(secret);
}

export async function signAppJwt(
  env: Env,
  payload: { userId: string; isPremium: boolean; firebaseUid?: string }
): Promise<string> {
  const secret = await importHs256Secret(env.JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    user_id: payload.userId,
    is_premium: payload.isPremium,
    firebase_uid: payload.firebaseUid
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60)
    .sign(secret);
}

export async function verifyAppJwt(
  env: Pick<Env, 'JWT_SECRET'>,
  token: string
): Promise<JwtClaims> {
  const secret = await importHs256Secret(env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256']
  });

  return {
    user_id: String(payload.user_id),
    is_premium: Boolean(payload.is_premium),
    firebase_uid: payload.firebase_uid ? String(payload.firebase_uid) : undefined,
    jti: payload.jti ? String(payload.jti) : undefined,
    exp: Number(payload.exp),
    iat: Number(payload.iat)
  };
}

const FIREBASE_CERT_CACHE_KEY = 'firebase_x509_certs';
const FIREBASE_CERT_CACHE_TTL_SECONDS = 3600; // 1 hour

async function resolveFirebaseVerificationKey(env: Env, token: string): Promise<CryptoKey> {
  const header = decodeProtectedHeader(token);
  if (!header.kid) {
    throw new Error('Firebase token is missing kid header.');
  }

  // Try KV cache first
  const cached = await env.CACHE.get(FIREBASE_CERT_CACHE_KEY);
  let certificates: Record<string, string>;

  if (cached) {
    certificates = JSON.parse(cached) as Record<string, string>;
  } else {
    const response = await fetch(FIREBASE_X509_URL);
    if (!response.ok) {
      throw new Error('Unable to fetch Firebase verification certificates.');
    }
    certificates = (await response.json()) as Record<string, string>;
    await env.CACHE.put(FIREBASE_CERT_CACHE_KEY, JSON.stringify(certificates), {
      expirationTtl: FIREBASE_CERT_CACHE_TTL_SECONDS
    });
  }

  const certificate = certificates[header.kid];

  if (!certificate) {
    // kid not found in cache — force refresh once
    const response = await fetch(FIREBASE_X509_URL);
    if (!response.ok) {
      throw new Error('Unable to fetch Firebase verification certificates.');
    }
    const freshCerts = (await response.json()) as Record<string, string>;
    await env.CACHE.put(FIREBASE_CERT_CACHE_KEY, JSON.stringify(freshCerts), {
      expirationTtl: FIREBASE_CERT_CACHE_TTL_SECONDS
    });
    const freshCert = freshCerts[header.kid];
    if (!freshCert) {
      throw new Error('Unable to resolve Firebase verification certificate.');
    }
    return importX509(freshCert, 'RS256');
  }

  return importX509(certificate, 'RS256');
}

interface VerifiedFirebaseToken {
  aud: string;
  iss: string;
  sub: string;
  user_id?: string;
  email?: string;
  emailVerified: boolean;
  firebase?: { sign_in_provider?: string };
}

/**
 * Shared JWKS/signature verification core. Google's certificate endpoint is
 * shared across every Firebase project, so only the issuer/audience check is
 * project-specific — callers supply which project's tokens they trust.
 */
async function verifyFirebaseIdTokenForProject(
  env: Env,
  token: string,
  projectId: string
): Promise<VerifiedFirebaseToken> {
  const issuer = `https://securetoken.google.com/${projectId}`;
  const key = await resolveFirebaseVerificationKey(env, token);

  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'],
    issuer,
    audience: projectId
  });

  if (!payload.sub) {
    throw new Error('Firebase token subject is missing.');
  }

  return {
    aud: Array.isArray(payload.aud) ? payload.aud[0] : String(payload.aud ?? ''),
    iss: String(payload.iss ?? ''),
    sub: String(payload.sub),
    user_id: payload['user_id'] != null ? String(payload['user_id']) : undefined,
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    emailVerified: payload['email_verified'] === true,
    firebase: (payload['firebase'] as VerifiedFirebaseToken['firebase']) ?? undefined
  };
}

export async function verifyFirebaseIdToken(env: Env, token: string): Promise<FirebaseIdTokenClaims> {
  const account = getGoogleServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const verified = await verifyFirebaseIdTokenForProject(env, token, account.project_id);

  return {
    aud: verified.aud,
    iss: verified.iss,
    sub: verified.sub,
    user_id: verified.user_id,
    firebase: verified.firebase
  };
}

/**
 * Verifies a Firebase ID token issued by the admin-notifications panel's OWN
 * Firebase project (ADMIN_PANEL_FIREBASE_PROJECT_ID) — a different project
 * than Astroloji's own end-user Firebase project. Used only by
 * requireAdminPanelAuth (middleware/auth.ts).
 */
export async function verifyAdminPanelIdentity(
  env: Env,
  token: string
): Promise<{ sub: string; email?: string; emailVerified: boolean }> {
  const verified = await verifyFirebaseIdTokenForProject(env, token, env.ADMIN_PANEL_FIREBASE_PROJECT_ID);
  return { sub: verified.sub, email: verified.email, emailVerified: verified.emailVerified };
}

export async function createGoogleAccessToken(
  serviceAccountJson: string,
  scope: string,
  signal?: AbortSignal
): Promise<string> {
  const account = getGoogleServiceAccount(serviceAccountJson);
  const privateKey = await importPKCS8(account.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(account.token_uri, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as {
    access_token?: string;
  };

  if (!payload.access_token) {
    throw new Error('Google OAuth token response did not include an access token.');
  }

  return payload.access_token;
}
