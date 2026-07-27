const ADMOB_PUBLIC_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const PUBLIC_KEY_CACHE_TTL_MS = 12 * 60 * 60 * 1_000;
const MISS_REFRESH_COOLDOWN_MS = 5 * 60 * 1_000;
const PUBLIC_KEY_FETCH_TIMEOUT_MS = 5_000;
const P256_COMPONENT_SIZE = 32;

export type AdmobSsvErrorCode =
  | 'MALFORMED_CALLBACK'
  | 'INVALID_SIGNATURE'
  | 'UNKNOWN_KEY'
  | 'KEY_FETCH_FAILED';

export class AdmobSsvVerificationError extends Error {
  constructor(
    readonly code: AdmobSsvErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AdmobSsvVerificationError';
  }
}

export interface AdmobSsvFields {
  adNetwork: string;
  adUnit: string;
  customData: string;
  rewardAmount: number;
  rewardItem: string;
  timestampMs: number;
  transactionId: string;
  userId: string;
}

export interface ParsedAdmobSsvCallback {
  signedContent: string;
  signature: string;
  keyId: string;
  fields: AdmobSsvFields;
}

export interface AdmobKeyCache {
  expiresAtMs: number;
  missRefreshAfterMs: number;
  keys: Map<string, string>;
}

interface AdmobKeyResponse {
  keys?: Array<{
    keyId?: number | string;
    base64?: string;
  }>;
}

interface AdmobSsvVerifierOptions {
  fetcher?: typeof fetch;
  cache?: AdmobKeyCache;
  now?: () => number;
  keysUrl?: string;
  subtle?: SubtleCrypto;
  fetchTimeoutMs?: number;
}

const defaultKeyCache: AdmobKeyCache = {
  expiresAtMs: 0,
  missRefreshAfterMs: 0,
  keys: new Map()
};

function malformed(message: string): never {
  throw new AdmobSsvVerificationError('MALFORMED_CALLBACK', message);
}

function decodeBase64(value: string): Uint8Array {
  try {
    const decoded = atob(value.replace(/\s+/g, ''));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    malformed('Callback contains invalid base64 data.');
  }
}


function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return decodeBase64(padded);
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; nextOffset: number } {
  const first = bytes[offset];
  if (first === undefined) {
    malformed('ECDSA signature has a truncated DER length.');
  }
  if ((first & 0x80) === 0) {
    return { length: first, nextOffset: offset + 1 };
  }

  const byteCount = first & 0x7f;
  if (byteCount < 1 || byteCount > 2 || offset + byteCount >= bytes.length) {
    malformed('ECDSA signature has an unsupported DER length.');
  }

  let length = 0;
  for (let index = 0; index < byteCount; index += 1) {
    length = (length << 8) | (bytes[offset + 1 + index] ?? 0);
  }
  return { length, nextOffset: offset + 1 + byteCount };
}

function readDerInteger(
  bytes: Uint8Array,
  offset: number
): { value: Uint8Array; nextOffset: number } {
  if (bytes[offset] !== 0x02) {
    malformed('ECDSA signature is missing a DER integer.');
  }
  const length = readDerLength(bytes, offset + 1);
  const end = length.nextOffset + length.length;
  if (length.length < 1 || end > bytes.length) {
    malformed('ECDSA signature contains a truncated DER integer.');
  }

  let value = bytes.slice(length.nextOffset, end);
  if ((value[0] ?? 0) & 0x80) {
    malformed('ECDSA signature contains a negative DER integer.');
  }
  while (value.length > 1 && value[0] === 0) {
    value = value.slice(1);
  }
  if (value.length > P256_COMPONENT_SIZE) {
    malformed('ECDSA signature integer exceeds the P-256 component size.');
  }
  return { value, nextOffset: end };
}

export function derEcdsaSignatureToP1363(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30) {
    malformed('ECDSA signature is not a DER sequence.');
  }
  const sequence = readDerLength(signature, 1);
  if (sequence.nextOffset + sequence.length !== signature.length) {
    malformed('ECDSA signature DER sequence length is invalid.');
  }

  const r = readDerInteger(signature, sequence.nextOffset);
  const s = readDerInteger(signature, r.nextOffset);
  if (s.nextOffset !== signature.length) {
    malformed('ECDSA signature contains trailing DER data.');
  }

  const output = new Uint8Array(P256_COMPONENT_SIZE * 2);
  output.set(r.value, P256_COMPONENT_SIZE - r.value.length);
  output.set(s.value, output.length - s.value.length);
  return output;
}

function requiredSingleValue(params: URLSearchParams, name: string): string {
  const values = params.getAll(name);
  if (values.length !== 1 || !values[0]) {
    malformed(`Callback requires exactly one ${name} parameter.`);
  }
  return values[0];
}

function decodeSignedContent(value: string): string {
  // Match Google's RewardedAdsVerifier URI.getQuery() behavior: decode percent escapes
  // without treating literal '+' characters as spaces. Parameter order remains unchanged.
  try {
    return decodeURIComponent(value);
  } catch {
    malformed('Callback query contains invalid percent-encoding.');
  }
}

function parsePositiveInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    malformed(`Callback ${name} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    malformed(`Callback ${name} is outside the supported range.`);
  }
  return parsed;
}

export function parseAdmobSsvCallback(callbackUrl: string): ParsedAdmobSsvCallback {
  const queryStart = callbackUrl.indexOf('?');
  if (queryStart < 0 || queryStart === callbackUrl.length - 1) {
    malformed('Callback URL does not contain a query string.');
  }

  const rawQuery = callbackUrl.slice(queryStart + 1);
  const signatureMarker = '&signature=';
  const signatureIndex = rawQuery.lastIndexOf(signatureMarker);
  if (signatureIndex <= 0) {
    malformed('Callback requires signature and signed content parameters.');
  }

  const signedContent = rawQuery.slice(0, signatureIndex);
  const terminal = rawQuery.slice(signatureIndex + 1);
  const terminalMatch = /^signature=([^&]+)&key_id=(\d+)$/.exec(terminal);
  if (!terminalMatch || signedContent.includes('&signature=') || signedContent.includes('&key_id=')) {
    malformed('Callback signature and key_id must be the final ordered parameters.');
  }

  const signature = terminalMatch[1] ?? '';
  const keyId = terminalMatch[2] ?? '';
  if (!signature || !keyId) {
    malformed('Callback signature parameters must not be empty.');
  }

  const params = new URLSearchParams(signedContent);
  const transactionId = requiredSingleValue(params, 'transaction_id');
  if (!/^[a-fA-F0-9]{16,128}$/.test(transactionId)) {
    malformed('Callback transaction_id must be a hexadecimal identifier.');
  }

  return {
    signedContent,
    signature,
    keyId,
    fields: {
      adNetwork: requiredSingleValue(params, 'ad_network'),
      adUnit: requiredSingleValue(params, 'ad_unit'),
      customData: requiredSingleValue(params, 'custom_data'),
      rewardAmount: parsePositiveInteger(requiredSingleValue(params, 'reward_amount'), 'reward_amount'),
      rewardItem: requiredSingleValue(params, 'reward_item'),
      timestampMs: parsePositiveInteger(requiredSingleValue(params, 'timestamp'), 'timestamp'),
      transactionId,
      userId: requiredSingleValue(params, 'user_id')
    }
  };
}

async function refreshPublicKeys(
  cache: AdmobKeyCache,
  fetcher: typeof fetch,
  keysUrl: string,
  nowMs: number,
  fetchTimeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(keysUrl, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
  } catch {
    throw new AdmobSsvVerificationError('KEY_FETCH_FAILED', 'AdMob public keys could not be fetched.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new AdmobSsvVerificationError(
      'KEY_FETCH_FAILED',
      `AdMob public key server returned HTTP ${response.status}.`
    );
  }

  let payload: AdmobKeyResponse;
  try {
    payload = (await response.json()) as AdmobKeyResponse;
  } catch {
    throw new AdmobSsvVerificationError('KEY_FETCH_FAILED', 'AdMob public key response is invalid JSON.');
  }

  const keys = new Map<string, string>();
  for (const entry of payload.keys ?? []) {
    const keyId = String(entry.keyId ?? '');
    const base64 = entry.base64?.trim();
    if (/^\d+$/.test(keyId) && base64) {
      keys.set(keyId, base64);
    }
  }

  cache.keys = keys;
  cache.expiresAtMs = nowMs + PUBLIC_KEY_CACHE_TTL_MS;
}

async function getPublicKeyBase64(
  keyId: string,
  options: Required<
    Pick<AdmobSsvVerifierOptions, 'fetcher' | 'now' | 'keysUrl' | 'fetchTimeoutMs'>
  > & {
    cache: AdmobKeyCache;
  }
): Promise<string> {
  const nowMs = options.now();
  let refreshedThisCall = false;
  if (options.cache.expiresAtMs <= nowMs) {
    await refreshPublicKeys(
      options.cache,
      options.fetcher,
      options.keysUrl,
      nowMs,
      options.fetchTimeoutMs
    );
    refreshedThisCall = true;
  }

  let key = options.cache.keys.get(keyId);
  if (!key && !refreshedThisCall && options.cache.missRefreshAfterMs <= nowMs) {
    await refreshPublicKeys(
      options.cache,
      options.fetcher,
      options.keysUrl,
      nowMs,
      options.fetchTimeoutMs
    );
    refreshedThisCall = true;
    key = options.cache.keys.get(keyId);
  }
  if (!key) {
    if (refreshedThisCall) {
      options.cache.missRefreshAfterMs = nowMs + MISS_REFRESH_COOLDOWN_MS;
    }
    throw new AdmobSsvVerificationError('UNKNOWN_KEY', 'AdMob callback references an unknown key ID.');
  }
  return key;
}

export function createAdmobSsvVerifier(options: AdmobSsvVerifierOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const cache = options.cache ?? defaultKeyCache;
  const now = options.now ?? Date.now;
  const keysUrl = options.keysUrl ?? ADMOB_PUBLIC_KEYS_URL;
  const subtle = options.subtle ?? crypto.subtle;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? PUBLIC_KEY_FETCH_TIMEOUT_MS;

  return async (callbackUrl: string): Promise<ParsedAdmobSsvCallback> => {
    const parsed = parseAdmobSsvCallback(callbackUrl);
    const publicKeyBase64 = await getPublicKeyBase64(parsed.keyId, {
      fetcher,
      cache,
      now,
      keysUrl,
      fetchTimeoutMs
    });

    let publicKey: CryptoKey;
    try {
      publicKey = await subtle.importKey(
        'spki',
        toArrayBuffer(decodeBase64(publicKeyBase64)),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
    } catch {
      throw new AdmobSsvVerificationError('UNKNOWN_KEY', 'AdMob public key could not be imported.');
    }

    const signature = derEcdsaSignatureToP1363(decodeBase64Url(parsed.signature));
    const verified = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      toArrayBuffer(signature),
      toArrayBuffer(new TextEncoder().encode(decodeSignedContent(parsed.signedContent)))
    );
    if (!verified) {
      throw new AdmobSsvVerificationError('INVALID_SIGNATURE', 'AdMob callback signature is invalid.');
    }

    return parsed;
  };
}

export const verifyAdmobSsvCallback = createAdmobSsvVerifier();
