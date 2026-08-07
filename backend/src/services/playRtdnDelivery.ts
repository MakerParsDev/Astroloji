export type ParsedPlayRtdnMessage =
  | {
      kind: 'test';
      messageId: string;
      packageName: string;
      decodedBytes: Uint8Array;
      notificationType: 'test';
    }
  | {
      kind: 'subscription';
      messageId: string;
      packageName: string;
      decodedBytes: Uint8Array;
      purchaseToken: string;
      productId: string;
      notificationType: number | string;
    };

const SUPPORTED_SUBSCRIPTION_NOTIFICATION_TYPES = new Set<number | string>([
  2, 3, 4, 7, 10, 13,
  'SUBSCRIPTION_PURCHASED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_CANCELED',
  'SUBSCRIPTION_EXPIRED',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_RESTARTED'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function decodeBase64(data: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new Error('Play RTDN Pub/Sub data is not valid base64.');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeDeveloperNotification(decodedBytes: Uint8Array): Record<string, unknown> {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(decodedBytes);
  } catch {
    throw new Error('Play RTDN payload is not valid UTF-8.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Play RTDN payload is not valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new Error('Play RTDN developer notification must be an object.');
  }
  return parsed;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value;
}
export function parsePlayRtdnEnvelope(payload: unknown): ParsedPlayRtdnMessage {
  if (!isRecord(payload) || !isRecord(payload.message)) {
    throw new Error('Play RTDN request must use a Pub/Sub push envelope.');
  }

  const messageId = requireNonEmptyString(
    payload.message.messageId,
    'Play RTDN Pub/Sub messageId is required.'
  );
  const data = requireNonEmptyString(
    payload.message.data,
    'Play RTDN Pub/Sub data is required.'
  );
  const decodedBytes = decodeBase64(data);
  const developerNotification = decodeDeveloperNotification(decodedBytes);
  const packageName = requireNonEmptyString(
    developerNotification.packageName,
    'Play RTDN packageName is required.'
  );

  const hasTest = isRecord(developerNotification.testNotification);
  const hasSubscription = isRecord(developerNotification.subscriptionNotification);
  if (hasTest === hasSubscription) {
    throw new Error('Play RTDN notification form is unsupported.');
  }

  if (hasTest) {
    return { kind: 'test', messageId, packageName, decodedBytes, notificationType: 'test' };
  }

  const source = developerNotification.subscriptionNotification as Record<string, unknown>;
  const purchaseToken = requireNonEmptyString(
    source.purchaseToken,
    'Play RTDN purchase token is required.'
  );  const productId = requireNonEmptyString(
    source.subscriptionId,
    'Play RTDN subscription ID is required.'
  );
  const notificationType = source.notificationType;
  if (!SUPPORTED_SUBSCRIPTION_NOTIFICATION_TYPES.has(notificationType as number | string)) {
    throw new Error('Play RTDN subscription notification type is unsupported.');
  }

  return {
    kind: 'subscription',
    messageId,
    packageName,
    decodedBytes,
    purchaseToken,
    productId,
    notificationType: notificationType as number | string
  };
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function fingerprintPlayRtdnMessage(
  packageName: string,
  decodedBytes: Uint8Array
): Promise<string> {
  const packageBytes = new TextEncoder().encode(packageName);
  const input = new Uint8Array(packageBytes.length + 1 + decodedBytes.length);
  input.set(packageBytes, 0);
  input[packageBytes.length] = 0;
  input.set(decodedBytes, packageBytes.length + 1);
  return toHex(await crypto.subtle.digest('SHA-256', input));
}
export async function shortPlayRtdnMessageRef(messageId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(messageId));
  return toHex(digest).slice(0, 12);
}