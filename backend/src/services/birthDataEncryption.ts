import { z } from 'zod';

import type { Env } from '@/types';

const AES_GCM_IV_BYTES = 12;
const AES_256_KEY_BYTES = 32;
const CURRENT_ENCRYPTION_KEY_VERSION = 1;

export const birthDataPlaintextSchema = z.object({
  /** ISO 8601 UTC instant — already converted from the user's local wall-clock birth time. */
  timestamp: z.string().datetime(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tzid: z.string().min(1)
});

export type BirthDataPlaintext = z.infer<typeof birthDataPlaintextSchema>;

export interface EncryptedBirthData {
  ciphertext: string;
  iv: string;
  keyVersion: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** crypto.subtle's BufferSource parameters require an ArrayBuffer-backed view; Uint8Array's own buffer type is wider (ArrayBufferLike) under the current DOM lib types. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importEncryptionKey(rawKeyBase64: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(rawKeyBase64);
  if (keyBytes.length !== AES_256_KEY_BYTES) {
    throw new Error(
      `BIRTH_DATA_ENCRYPTION_KEY must decode to exactly ${AES_256_KEY_BYTES} bytes (AES-256); got ${keyBytes.length}.`
    );
  }
  return crypto.subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypts a birth date/time + location as one AES-256-GCM ciphertext (a
 * single authenticated envelope, not per-field encryption — simpler to
 * implement correctly and avoids leaking cross-field metadata via IV reuse
 * mistakes). A fresh random IV is generated per call; AES-GCM's
 * authentication tag means any tampering with the stored ciphertext or IV
 * causes decryption to fail loudly rather than return corrupted data.
 */
export async function encryptBirthData(
  env: Pick<Env, 'BIRTH_DATA_ENCRYPTION_KEY'>,
  plaintext: BirthDataPlaintext
): Promise<EncryptedBirthData> {
  const key = await importEncryptionKey(env.BIRTH_DATA_ENCRYPTION_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
    keyVersion: CURRENT_ENCRYPTION_KEY_VERSION
  };
}

/**
 * Decrypts and validates a stored birth data envelope. Throws (never
 * returns a best-effort partial result) if the ciphertext fails
 * AES-GCM authentication, the key version is not one this deployment can
 * decrypt, or the decrypted JSON does not match the expected shape —
 * decrypted user input is still untrusted input.
 */
export async function decryptBirthData(
  env: Pick<Env, 'BIRTH_DATA_ENCRYPTION_KEY'>,
  encrypted: EncryptedBirthData
): Promise<BirthDataPlaintext> {
  if (encrypted.keyVersion !== CURRENT_ENCRYPTION_KEY_VERSION) {
    throw new Error(
      `Birth data was encrypted with key version ${encrypted.keyVersion}, but this deployment only supports version ${CURRENT_ENCRYPTION_KEY_VERSION}.`
    );
  }

  const key = await importEncryptionKey(env.BIRTH_DATA_ENCRYPTION_KEY);
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);

  let plaintextBuffer: ArrayBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
  } catch {
    throw new Error('Birth data could not be decrypted — the ciphertext is invalid or has been tampered with.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(new TextDecoder().decode(plaintextBuffer));
  } catch {
    throw new Error('Decrypted birth data was not valid JSON.');
  }

  const parsed = birthDataPlaintextSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(`Decrypted birth data did not match the expected shape: ${parsed.error.message}`);
  }

  return parsed.data;
}
