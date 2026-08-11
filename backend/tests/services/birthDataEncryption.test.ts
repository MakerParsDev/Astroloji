import { describe, expect, it } from 'vitest';

import { decryptBirthData, encryptBirthData, type BirthDataPlaintext } from '@/services/birthDataEncryption';

// Fixture key only — never a real secret. 32 random bytes, base64-encoded.
const TEST_KEY = 'VEVTVC1PTkxZLUZBS0UtS0VZLU5PVC1SRUFMLTAwMDA=';
const OTHER_KEY = 'VEVTVC1PTkxZLU9USEVSLUZBS0UtS0VZLU5PVC0wMDI=';

const plaintext: BirthDataPlaintext = {
  timestamp: '1990-06-15T09:15:00.000Z',
  latitude: 41.01,
  longitude: 28.98,
  tzid: 'Europe/Istanbul'
};

describe('encryptBirthData / decryptBirthData', () => {
  it('round-trips a birth data payload', async () => {
    const env = { BIRTH_DATA_ENCRYPTION_KEY: TEST_KEY };
    const encrypted = await encryptBirthData(env, plaintext);

    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.ciphertext).not.toBe('');
    expect(encrypted.iv).not.toBe('');

    await expect(decryptBirthData(env, encrypted)).resolves.toEqual(plaintext);
  });

  it('produces a different ciphertext and IV on every call (fresh random IV, no reuse)', async () => {
    const env = { BIRTH_DATA_ENCRYPTION_KEY: TEST_KEY };
    const first = await encryptBirthData(env, plaintext);
    const second = await encryptBirthData(env, plaintext);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('rejects decryption with the wrong key', async () => {
    const encrypted = await encryptBirthData({ BIRTH_DATA_ENCRYPTION_KEY: TEST_KEY }, plaintext);

    await expect(decryptBirthData({ BIRTH_DATA_ENCRYPTION_KEY: OTHER_KEY }, encrypted)).rejects.toThrow(
      /could not be decrypted/
    );
  });

  it('rejects a tampered ciphertext (AES-GCM authentication failure)', async () => {
    const env = { BIRTH_DATA_ENCRYPTION_KEY: TEST_KEY };
    const encrypted = await encryptBirthData(env, plaintext);

    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -4) + 'abcd' };

    await expect(decryptBirthData(env, tampered)).rejects.toThrow(/could not be decrypted/);
  });

  it('rejects a tampered IV', async () => {
    const env = { BIRTH_DATA_ENCRYPTION_KEY: TEST_KEY };
    const encrypted = await encryptBirthData(env, plaintext);
    const tamperedIvBytes = Buffer.from(encrypted.iv, 'base64');
    tamperedIvBytes[0] ^= 0xff;

    const tampered = { ...encrypted, iv: tamperedIvBytes.toString('base64') };

    await expect(decryptBirthData(env, tampered)).rejects.toThrow(/could not be decrypted/);
  });

  it('rejects an unsupported key version', async () => {
    const env = { BIRTH_DATA_ENCRYPTION_KEY: TEST_KEY };
    const encrypted = await encryptBirthData(env, plaintext);

    await expect(decryptBirthData(env, { ...encrypted, keyVersion: 99 })).rejects.toThrow(/key version/);
  });

  it('rejects a key that does not decode to 32 bytes', async () => {
    await expect(
      encryptBirthData({ BIRTH_DATA_ENCRYPTION_KEY: btoa('too-short') }, plaintext)
    ).rejects.toThrow(/32 bytes/);
  });

});
