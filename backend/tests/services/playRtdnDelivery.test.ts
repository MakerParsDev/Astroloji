import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  claimPlayRtdnMessage,
  createPlayRtdnFinalizeStatement,
  finalizePlayRtdnMessage,
  fingerprintPlayRtdnMessage,
  parsePlayRtdnEnvelope,
  releasePlayRtdnClaim,
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
interface ClaimRow {
  message_id: string;
  package_name: string;
  message_fingerprint: string;
  notification_type: string;
  status: 'processing' | 'processed';
  received_at: string;
  processed_at: string | null;
  outcome: string | null;
}

function createClaimDb(initial: ClaimRow[] = []) {
  const rows = new Map(initial.map((row) => [row.message_id, { ...row }]));
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const statement = {
        bind(...values: unknown[]) {
          bindings = values;
          return statement;
        },
        async first() {
          if (!normalized.startsWith('SELECT package_name, message_fingerprint, status')) return null;
          return rows.get(String(bindings[0])) ?? null;
        },        async run() {
          if (normalized.startsWith('INSERT INTO play_rtdn_messages')) {
            const [messageId, packageName, fingerprint, notificationType, receivedAt] = bindings.map(String);
            if (rows.has(messageId)) return { success: true, meta: { changes: 0 } };
            rows.set(messageId, {
              message_id: messageId,
              package_name: packageName,
              message_fingerprint: fingerprint,
              notification_type: notificationType,
              status: 'processing',
              received_at: receivedAt,
              processed_at: null,
              outcome: null
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith('DELETE FROM play_rtdn_messages')) {
            const [messageId, fingerprint] = bindings.map(String);
            const row = rows.get(messageId);
            const matches = row?.message_fingerprint === fingerprint && row.status === 'processing';
            if (matches) rows.delete(messageId);
            return { success: true, meta: { changes: matches ? 1 : 0 } };
          }          if (normalized.startsWith('UPDATE play_rtdn_messages')) {
            const [processedAt, outcome, messageId, fingerprint] = bindings.map(String);
            const row = rows.get(messageId);
            const matches = row?.message_fingerprint === fingerprint && row.status === 'processing';
            if (matches && row) {
              row.status = 'processed';
              row.processed_at = processedAt;
              row.outcome = outcome;
            }
            return { success: true, meta: { changes: matches ? 1 : 0 } };
          }
          throw new Error(`Unexpected SQL: ${normalized}`);
        }
      };
      return statement;
    },
    async batch() {
      return [];
    }
  } as unknown as D1Database;
  return { db, rows };
}

function processingRow(patch: Partial<ClaimRow> = {}): ClaimRow {
  return {
    message_id: 'message-1', package_name: 'com.example.astrology',
    message_fingerprint: 'fingerprint-1', notification_type: '4', status: 'processing',
    received_at: '2026-08-08T00:00:00.000Z', processed_at: null, outcome: null, ...patch
  };
}
describe('Play RTDN D1 delivery claims', () => {
  it('defines the additive schema without sensitive payload columns', () => {
    const migration = readFileSync('migrations/0002_play_rtdn_messages.sql', 'utf8');
    const schema = readFileSync('schema.sql', 'utf8');
    for (const source of [migration, schema]) {
      expect(source).toContain('CREATE TABLE IF NOT EXISTS play_rtdn_messages');
      expect(source).toContain('message_id TEXT PRIMARY KEY');
      expect(source).toContain('message_fingerprint TEXT NOT NULL');
      expect(source).toContain("status TEXT NOT NULL CHECK (status IN ('processing', 'processed'))");
      expect(source).toContain('idx_play_rtdn_messages_received_at');
      const block = source.match(/CREATE TABLE IF NOT EXISTS play_rtdn_messages[\s\S]*?\);/)?.[0];
      expect(block).toBeDefined();
      expect(block).not.toMatch(/purchase_token/i);
      expect(block).not.toMatch(/raw_payload|payload\s+TEXT/i);
    }
  });

  it('atomically claims a first message as processing', async () => {
    const { db, rows } = createClaimDb();
    const result = await claimPlayRtdnMessage(db, {
      messageId: 'message-1', packageName: 'com.example.astrology',
      fingerprint: 'fingerprint-1', notificationType: '4',
      receivedAt: '2026-08-08T00:00:00.000Z'
    });
    expect(result).toBe('claimed');
    expect(rows.get('message-1')?.status).toBe('processing');
  });
  it('classifies an already processed matching message as duplicate_processed', async () => {
    const { db } = createClaimDb([processingRow({ status: 'processed', processed_at: '2026-08-08T00:01:00.000Z' })]);
    await expect(claimPlayRtdnMessage(db, {
      messageId: 'message-1', packageName: 'com.example.astrology',
      fingerprint: 'fingerprint-1', notificationType: '4',
      receivedAt: '2026-08-08T00:02:00.000Z'
    })).resolves.toBe('duplicate_processed');
  });

  it('classifies an in-flight matching message as duplicate_processing', async () => {
    const { db } = createClaimDb([processingRow()]);
    await expect(claimPlayRtdnMessage(db, {
      messageId: 'message-1', packageName: 'com.example.astrology',
      fingerprint: 'fingerprint-1', notificationType: '4',
      receivedAt: '2026-08-08T00:02:00.000Z'
    })).resolves.toBe('duplicate_processing');
  });

  it.each([
    ['package mismatch', { packageName: 'com.example.other', fingerprint: 'fingerprint-1' }],
    ['fingerprint mismatch', { packageName: 'com.example.astrology', fingerprint: 'fingerprint-2' }]
  ])('classifies same message ID with %s as mismatch', async (_name, values) => {
    const { db } = createClaimDb([processingRow()]);
    await expect(claimPlayRtdnMessage(db, {
      messageId: 'message-1', notificationType: '4', receivedAt: '2026-08-08T00:02:00.000Z', ...values
    })).resolves.toBe('mismatch');
  });
  it('releases only the exact still-processing claim', async () => {
    const first = createClaimDb([processingRow()]);
    await releasePlayRtdnClaim(first.db, 'message-1', 'fingerprint-1');
    expect(first.rows.has('message-1')).toBe(false);

    const wrongFingerprint = createClaimDb([processingRow()]);
    await releasePlayRtdnClaim(wrongFingerprint.db, 'message-1', 'fingerprint-2');
    expect(wrongFingerprint.rows.has('message-1')).toBe(true);

    const processed = createClaimDb([processingRow({ status: 'processed' })]);
    await releasePlayRtdnClaim(processed.db, 'message-1', 'fingerprint-1');
    expect(processed.rows.has('message-1')).toBe(true);
  });

  it('finalizes only the exact processing claim', async () => {
    const { db, rows } = createClaimDb([processingRow()]);
    await finalizePlayRtdnMessage(
      db, 'message-1', 'fingerprint-1', 'processed', '2026-08-08T00:03:00.000Z'
    );
    expect(rows.get('message-1')).toMatchObject({
      status: 'processed', processed_at: '2026-08-08T00:03:00.000Z', outcome: 'processed'
    });
  });

  it('fails standalone finalize when identity/status guards do not match', async () => {
    const { db } = createClaimDb([processingRow()]);
    await expect(finalizePlayRtdnMessage(
      db, 'message-1', 'fingerprint-2', 'processed', '2026-08-08T00:03:00.000Z'
    )).rejects.toThrow();
  });
  it('creates a guarded finalize statement for transaction batches', async () => {
    const { db, rows } = createClaimDb([processingRow()]);
    const statement = createPlayRtdnFinalizeStatement(
      db, 'message-1', 'fingerprint-1', 'test', '2026-08-08T00:04:00.000Z'
    );
    await statement.run();
    expect(rows.get('message-1')).toMatchObject({
      status: 'processed', processed_at: '2026-08-08T00:04:00.000Z', outcome: 'test'
    });
  });
});