import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdmobSsvVerificationError,
  createAdmobSsvVerifier,
  parseAdmobSsvCallback,
  type AdmobKeyCache
} from '@/services/admobSsv';

const KEY_ID = 1916455855;

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function trimInteger(bytes: Uint8Array): Uint8Array {
  let offset = 0;
  while (offset < bytes.length - 1 && bytes[offset] === 0) {
    offset += 1;
  }
  const value = bytes.slice(offset);
  if ((value[0] ?? 0) & 0x80) {
    const prefixed = new Uint8Array(value.length + 1);
    prefixed.set(value, 1);
    return prefixed;
  }
  return value;
}

function p1363ToDer(signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) {
    throw new Error(`Expected a 64-byte P1363 signature, received ${signature.length}.`);
  }
  const r = trimInteger(signature.slice(0, 32));
  const s = trimInteger(signature.slice(32));
  const payloadLength = 2 + r.length + 2 + s.length;
  const der = new Uint8Array(2 + payloadLength);
  let offset = 0;
  der[offset++] = 0x30;
  der[offset++] = payloadLength;
  der[offset++] = 0x02;
  der[offset++] = r.length;
  der.set(r, offset);
  offset += r.length;
  der[offset++] = 0x02;
  der[offset++] = s.length;
  der.set(s, offset);
  return der;
}

async function createSignedCallback(
  overrides: Partial<Record<string, string>> = {},
  options: { decodeBeforeSigning?: boolean } = {}
) {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey));
  const params = {
    ad_network: '5450213213286189855',
    ad_unit: 'ca-app-pub-3940256099942544/5224354917',
    custom_data: 'challenge%2Fopaque%2Bvalue',
    reward_amount: '1',
    reward_item: 'unlock',
    timestamp: '1785080000000',
    transaction_id: '18fa792de1bca816048293fc71035638',
    user_id: 'user-1',
    ...overrides
  };
  const signedContent = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(
        (options.decodeBeforeSigning ?? true) ? decodeURIComponent(signedContent) : signedContent
      )
    )
  );
  const signature = base64Url(p1363ToDer(rawSignature));
  const url = `https://astrology.parsfilo.com/api/v1/rewards/ssv?${signedContent}&signature=${signature}&key_id=${KEY_ID}`;
  return {
    url,
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
    signature,
    signedContent
  };
}

function createCache(): AdmobKeyCache {
  return { expiresAtMs: 0, missRefreshAfterMs: 0, keys: new Map() };
}

describe('AdMob SSV verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the exact signed query and decodes trusted callback fields', async () => {
    const callback = await createSignedCallback();
    const parsed = parseAdmobSsvCallback(callback.url);

    expect(parsed.signedContent).toBe(callback.signedContent);
    expect(parsed.signature).toBe(callback.signature);
    expect(parsed.keyId).toBe(String(KEY_ID));
    expect(parsed.fields.customData).toBe('challenge/opaque+value');
    expect(parsed.fields.userId).toBe('user-1');
  });

  it('verifies a valid DER-encoded ECDSA callback signature', async () => {
    const callback = await createSignedCallback();
    const fetcher = vi.fn(async () =>
      Response.json({
        keys: [{ keyId: KEY_ID, base64: callback.publicKeyBase64 }]
      })
    );
    const verify = createAdmobSsvVerifier({
      fetcher: fetcher as typeof fetch,
      cache: createCache(),
      now: () => 1_785_080_000_000
    });

    await expect(verify(callback.url)).resolves.toMatchObject({
      fields: {
        transactionId: '18fa792de1bca816048293fc71035638',
        timestampMs: 1_785_080_000_000,
        userId: 'user-1'
      }
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('verifies percent-encoded fields using Google Tink decoded-query semantics', async () => {
    const callback = await createSignedCallback(
      { reward_item: 'Premium%20Eri%C5%9Fim' },
      { decodeBeforeSigning: true }
    );
    const verify = createAdmobSsvVerifier({
      fetcher: (async () =>
        Response.json({ keys: [{ keyId: KEY_ID, base64: callback.publicKeyBase64 }] })) as typeof fetch,
      cache: createCache(),
      now: () => 1_785_080_000_000
    });

    await expect(verify(callback.url)).resolves.toMatchObject({
      fields: { rewardItem: 'Premium Erişim' }
    });
  });

  it('rejects a modified signed field', async () => {
    const callback = await createSignedCallback();
    const tamperedUrl = callback.url.replace('reward_amount=1', 'reward_amount=2');
    const verify = createAdmobSsvVerifier({
      fetcher: (async () =>
        Response.json({ keys: [{ keyId: KEY_ID, base64: callback.publicKeyBase64 }] })) as typeof fetch,
      cache: createCache(),
      now: () => 1_785_080_000_000
    });

    await expect(verify(tamperedUrl)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE'
    });
  });

  it('refreshes cached keys once when the callback key is not cached', async () => {
    const callback = await createSignedCallback();
    const cache = createCache();
    cache.expiresAtMs = Number.MAX_SAFE_INTEGER;
    cache.keys.set('old-key', callback.publicKeyBase64);
    const fetcher = vi.fn(async () =>
      Response.json({ keys: [{ keyId: KEY_ID, base64: callback.publicKeyBase64 }] })
    );
    const verify = createAdmobSsvVerifier({
      fetcher: fetcher as typeof fetch,
      cache,
      now: () => 1_785_080_000_000
    });

    await expect(verify(callback.url)).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid percent-encoding before signature verification', async () => {
    const callback = await createSignedCallback();
    const malformedUrl = callback.url.replace('reward_item=unlock', 'reward_item=%ZZ');
    const verify = createAdmobSsvVerifier({
      fetcher: (async () =>
        Response.json({ keys: [{ keyId: KEY_ID, base64: callback.publicKeyBase64 }] })) as typeof fetch,
      cache: createCache(),
      now: () => 1_785_080_000_000
    });

    await expect(verify(malformedUrl)).rejects.toMatchObject({
      code: 'MALFORMED_CALLBACK'
    });
  });

  it('rejects malformed terminal signature parameters', () => {
    const url =
      'https://astrology.parsfilo.com/api/v1/rewards/ssv?ad_unit=test&signature=abc&x=1&key_id=2';

    expect(() => parseAdmobSsvCallback(url)).toThrowError(
      expect.objectContaining<Partial<AdmobSsvVerificationError>>({
        code: 'MALFORMED_CALLBACK'
      })
    );
  });

  it('rejects an unknown key without repeatedly refetching during the miss cooldown', async () => {
    const callback = await createSignedCallback();
    const fetcher = vi.fn(async () => Response.json({ keys: [] }));
    const verify = createAdmobSsvVerifier({
      fetcher: fetcher as typeof fetch,
      cache: createCache(),
      now: () => 1_785_080_000_000
    });

    await expect(verify(callback.url)).rejects.toMatchObject({ code: 'UNKNOWN_KEY' });
    await expect(verify(callback.url)).rejects.toMatchObject({ code: 'UNKNOWN_KEY' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled public-key fetch within the configured timeout', async () => {
    const callback = await createSignedCallback();
    const fetcher = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    );
    const verify = createAdmobSsvVerifier({
      fetcher: fetcher as typeof fetch,
      cache: createCache(),
      now: () => 1_785_080_000_000,
      fetchTimeoutMs: 5
    });

    await expect(verify(callback.url)).rejects.toMatchObject({ code: 'KEY_FETCH_FAILED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
