import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const KEY_ID_PATTERN = /^[a-f0-9]{40}$/i;
const SERVICE_ACCOUNT_PATTERN = /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/;
const PEM_PRIVATE_KEY_PREFIX = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function assertKeyId(value, label) {
  const normalized = String(value ?? '');
  if (!KEY_ID_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a 40-character hexadecimal Google IAM key ID.`);
  }
  return normalized.toLowerCase();
}

export function keyIdFromName(name) {
  const keyId = String(name ?? '').split('/').at(-1) ?? '';
  return KEY_ID_PATTERN.test(keyId) ? keyId.toLowerCase() : '';
}

export function validateRetirementRequest({ expectedEmail, targetKeyId, serviceAccount }) {
  if (!SERVICE_ACCOUNT_PATTERN.test(expectedEmail ?? '')) {
    throw new Error('Expected service-account email is invalid.');
  }
  if (!serviceAccount || serviceAccount.type !== 'service_account') {
    throw new Error('Doppler PLAY_SERVICE_ACCOUNT_JSON is not a service-account credential.');
  }
  if (serviceAccount.client_email !== expectedEmail) {
    throw new Error('Doppler service account does not match the expected account.');
  }
  if (!String(serviceAccount.private_key ?? '').startsWith(PEM_PRIVATE_KEY_PREFIX)) {
    throw new Error('Doppler service account does not contain a valid private key.');
  }

  const normalizedTargetKeyId = assertKeyId(targetKeyId, 'Target key ID');
  const currentKeyId = assertKeyId(serviceAccount.private_key_id, 'Current Doppler key ID');
  if (normalizedTargetKeyId === currentKeyId) {
    throw new Error('Refusing to retire the active Doppler key.');
  }

  return {
    currentKeyId,
    serviceAccountEmail: serviceAccount.client_email,
    targetKeyId: normalizedTargetKeyId,
  };
}

export function verifyKeyInventory({ keys, currentKeyId, targetKeyId, phase }) {
  const userManagedKeys = (Array.isArray(keys) ? keys : [])
    .filter((key) => key?.keyType === 'USER_MANAGED')
    .map((key) => ({
      disabled: key?.disabled === true,
      id: keyIdFromName(key?.name),
      name: key?.name,
    }))
    .filter((key) => key.id);

  const current = userManagedKeys.find((key) => key.id === currentKeyId);
  const target = userManagedKeys.find((key) => key.id === targetKeyId);
  const currentPresent = Boolean(current && !current.disabled);
  const targetPresent = Boolean(target);

  if (!currentPresent) {
    throw new Error(`Active Doppler key is missing or disabled during ${phase} verification.`);
  }
  if (phase === 'before' && !targetPresent) {
    throw new Error('Target legacy key was not found; refusing an ambiguous deletion.');
  }
  if (phase === 'before' && target?.disabled) {
    throw new Error('Target legacy key is already disabled; review it manually before deletion.');
  }
  if (phase === 'after' && targetPresent) {
    throw new Error('Target legacy key is still present after deletion.');
  }
  if (!['before', 'after'].includes(phase)) {
    throw new Error('Unknown key-inventory verification phase.');
  }

  return { currentPresent, targetPresent, userManagedKeyCount: userManagedKeys.length };
}

function parseObjectJson(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

async function createAccessToken(serviceAccount, fetchFn = fetch) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  })}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key).toString('base64url')}`;

  const response = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const bodyText = await response.text();
  const body = bodyText ? parseObjectJson(bodyText, 'Google OAuth response') : {};
  if (!response.ok || !body.access_token) {
    const code = typeof body.error === 'string' ? body.error : 'unknown_error';
    throw new Error(`Google OAuth token request failed (${response.status}): ${code}.`);
  }
  return body.access_token;
}

async function iamRequest(url, { accessToken, method = 'GET', fetchFn = fetch }) {
  const response = await fetchFn(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  if (!response.ok) {
    let status = `${response.status}`;
    try {
      const body = parseObjectJson(text, 'Google IAM error response');
      const apiStatus = body?.error?.status;
      if (typeof apiStatus === 'string') status += ` ${apiStatus}`;
    } catch {
      // Keep only the HTTP status; never echo arbitrary response text.
    }
    throw new Error(`Google IAM request failed (${status}).`);
  }
  return text ? parseObjectJson(text, 'Google IAM response') : {};
}

export async function retireServiceAccountKey({
  expectedEmail,
  serviceAccount,
  targetKeyId,
  fetchFn = fetch,
}) {
  const request = validateRetirementRequest({ expectedEmail, serviceAccount, targetKeyId });
  const accessToken = await createAccessToken(serviceAccount, fetchFn);
  const accountPath = `projects/-/serviceAccounts/${encodeURIComponent(request.serviceAccountEmail)}`;
  const listUrl = `https://iam.googleapis.com/v1/${accountPath}/keys`;

  const before = await iamRequest(listUrl, { accessToken, fetchFn });
  verifyKeyInventory({
    keys: before.keys,
    currentKeyId: request.currentKeyId,
    targetKeyId: request.targetKeyId,
    phase: 'before',
  });
  const target = before.keys?.find((key) => keyIdFromName(key?.name) === request.targetKeyId);
  if (!target?.name) {
    throw new Error('Target legacy key resource name is missing after inventory verification.');
  }
  await iamRequest(`https://iam.googleapis.com/v1/${target.name}`, {
    accessToken,
    fetchFn,
    method: 'DELETE',
  });

  const after = await iamRequest(listUrl, { accessToken, fetchFn });
  const result = verifyKeyInventory({
    keys: after.keys,
    currentKeyId: request.currentKeyId,
    targetKeyId: request.targetKeyId,
    phase: 'after',
  });
  return {
    activeKeyVerified: result.currentPresent,
    retiredKeyId: request.targetKeyId,
    serviceAccountEmail: request.serviceAccountEmail,
  };
}

function loadServiceAccountFromDoppler(path) {
  if (!path || !fs.existsSync(path)) {
    throw new Error('DOPPLER_SECRETS_JSON_PATH must point to a readable file.');
  }
  const secrets = parseObjectJson(fs.readFileSync(path, 'utf8'), 'Doppler secret bundle');
  const credentialText = secrets.PLAY_SERVICE_ACCOUNT_JSON;
  if (typeof credentialText !== 'string' || !credentialText.trim()) {
    throw new Error('PLAY_SERVICE_ACCOUNT_JSON is missing from Doppler.');
  }
  return parseObjectJson(credentialText, 'PLAY_SERVICE_ACCOUNT_JSON');
}

async function main() {
  const result = await retireServiceAccountKey({
    expectedEmail: process.env.EXPECTED_SERVICE_ACCOUNT_EMAIL,
    serviceAccount: loadServiceAccountFromDoppler(process.env.DOPPLER_SECRETS_JSON_PATH),
    targetKeyId: process.env.TARGET_KEY_ID,
  });
  console.log(JSON.stringify({
    activeKeyVerified: result.activeKeyVerified,
    retiredKeyId: result.retiredKeyId,
    serviceAccountEmail: result.serviceAccountEmail,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
