import { describe, expect, it } from 'vitest';

import {
  fingerprintPlayRtdnMessage,
  parsePlayRtdnEnvelope,
  shortPlayRtdnMessageRef
} from '@/services/playRtdnDelivery';

const testNotification = {
  version: '1.0',
  packageName: 'com.example.astrology',
  eventTimeMillis: '1786147200000',
  testNotification: { version: '1.0' }
};

const subscriptionNotification = {
  version: '1.0',
  packageName: 'com.example.astrology',
  eventTimeMillis: '1786147200000',
  subscriptionNotification: {
    version: '1.0',
    notificationType: 4,
    purchaseToken: 'purchase-token',
    subscriptionId: 'premium_monthly'
  }
};
function envelopeFor(value: unknown, messageId = 'message-1') {
  return {
    message: {
      messageId,
      data: btoa(JSON.stringify(value))
    }
  };
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function expectedFingerprint(packageName: string, decodedBytes: Uint8Array) {
  const prefix = new TextEncoder().encode(packageName);
  const input = new Uint8Array(prefix.length + 1 + decodedBytes.length);
  input.set(prefix, 0);
  input[prefix.length] = 0;
  input.set(decodedBytes, prefix.length + 1);
  return bytesToHex(await crypto.subtle.digest('SHA-256', input));
}

describe('parsePlayRtdnEnvelope', () => {
  it('parses a Pub/Sub test notification as a no-op message', () => {
    const parsed = parsePlayRtdnEnvelope(envelopeFor(testNotification));
    expect(parsed.kind).toBe('test');
    expect(parsed).toMatchObject({
      messageId: 'message-1', packageName: 'com.example.astrology', notificationType: 'test'
    });
  });
  it('parses a supported subscription notification', () => {
    const parsed = parsePlayRtdnEnvelope(envelopeFor(subscriptionNotification));
    expect(parsed).toMatchObject({
      kind: 'subscription',
      messageId: 'message-1',
      packageName: 'com.example.astrology',
      purchaseToken: 'purchase-token',
      productId: 'premium_monthly',
      notificationType: 4
    });
  });

  it.each([
    ['missing messageId', { message: { data: btoa(JSON.stringify(testNotification)) } }],
    ['empty messageId', { message: { messageId: '', data: btoa(JSON.stringify(testNotification)) } }],
    ['missing data', { message: { messageId: 'message-1' } }],
    ['invalid base64', { message: { messageId: 'message-1', data: '@@@' } }]
  ])('rejects %s', (_name, payload) => {
    expect(() => parsePlayRtdnEnvelope(payload)).toThrow();
  });

  it('rejects invalid UTF-8', () => {
    const data = btoa(String.fromCharCode(0xff));
    expect(() => parsePlayRtdnEnvelope({ message: { messageId: 'message-1', data } })).toThrow();
  });

  it('rejects invalid JSON', () => {
    expect(() => parsePlayRtdnEnvelope({
      message: { messageId: 'message-1', data: btoa('{not-json') }
    })).toThrow();
  });
  it('rejects a developer notification without packageName', () => {
    const payload = { ...testNotification, packageName: '' };
    expect(() => parsePlayRtdnEnvelope(envelopeFor(payload))).toThrow();
  });

  it('rejects unsupported developer notification forms', () => {
    const payload = {
      version: '1.0',
      packageName: 'com.example.astrology',
      eventTimeMillis: '1786147200000',
      oneTimeProductNotification: { version: '1.0' }
    };
    expect(() => parsePlayRtdnEnvelope(envelopeFor(payload))).toThrow();
  });

  it.each([
    ['empty purchase token', { purchaseToken: '' }],
    ['empty subscription id', { subscriptionId: '' }],
    ['unsupported notification type', { notificationType: 999 }]
  ])('rejects subscription notification with %s', (_name, patch) => {
    const payload = {
      ...subscriptionNotification,
      subscriptionNotification: {
        ...subscriptionNotification.subscriptionNotification,
        ...patch
      }
    };
    expect(() => parsePlayRtdnEnvelope(envelopeFor(payload))).toThrow();
  });

  it('does not accept an unwrapped developer notification', () => {
    expect(() => parsePlayRtdnEnvelope(testNotification)).toThrow();
  });
});
describe('Play RTDN hashes', () => {
  it('fingerprints package, separator, and decoded bytes deterministically', async () => {
    const parsed = parsePlayRtdnEnvelope(envelopeFor(testNotification));
    const expected = await expectedFingerprint(parsed.packageName, parsed.decodedBytes);

    await expect(
      fingerprintPlayRtdnMessage(parsed.packageName, parsed.decodedBytes)
    ).resolves.toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes fingerprint when package changes for identical bytes', async () => {
    const parsed = parsePlayRtdnEnvelope(envelopeFor(testNotification));
    const first = await fingerprintPlayRtdnMessage(parsed.packageName, parsed.decodedBytes);
    const second = await fingerprintPlayRtdnMessage('com.example.other', parsed.decodedBytes);
    expect(second).not.toBe(first);
  });

  it('returns only a stable 12-character hashed message reference', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('message-1'));
    const expected = bytesToHex(digest).slice(0, 12);
    await expect(shortPlayRtdnMessageRef('message-1')).resolves.toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{12}$/);
  });
});