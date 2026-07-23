import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  keyIdFromName,
  retireServiceAccountKey,
  validateRetirementRequest,
  verifyKeyInventory,
} from './retire-google-service-account-key.mjs';

const fakePrivateKey = () => `${['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ')}\nplaceholder\n${['-----END', 'PRIVATE', 'KEY-----'].join(' ')}\n`;

test('keyIdFromName extracts a Google IAM key id', () => {
  assert.equal(
    keyIdFromName('projects/example/serviceAccounts/app@example.iam.gserviceaccount.com/keys/0123456789abcdef0123456789abcdef01234567'),
    '0123456789abcdef0123456789abcdef01234567',
  );
});

test('validateRetirementRequest accepts a distinct old key for the expected account', () => {
  assert.deepEqual(
    validateRetirementRequest({
      expectedEmail: 'app@example.iam.gserviceaccount.com',
      targetKeyId: '0123456789abcdef0123456789abcdef01234567',
      serviceAccount: {
        type: 'service_account',
        client_email: 'app@example.iam.gserviceaccount.com',
        private_key_id: '89abcdef0123456789abcdef0123456789abcdef',
        private_key: fakePrivateKey(),
      },
    }),
    {
      currentKeyId: '89abcdef0123456789abcdef0123456789abcdef',
      serviceAccountEmail: 'app@example.iam.gserviceaccount.com',
      targetKeyId: '0123456789abcdef0123456789abcdef01234567',
    },
  );
});

test('validateRetirementRequest normalizes string-like key IDs safely', () => {
  const target = { toString: () => '0123456789abcdef0123456789abcdef01234567' };
  const result = validateRetirementRequest({
    expectedEmail: 'app@example.iam.gserviceaccount.com',
    targetKeyId: target,
    serviceAccount: {
      type: 'service_account',
      client_email: 'app@example.iam.gserviceaccount.com',
      private_key_id: '89abcdef0123456789abcdef0123456789abcdef',
      private_key: fakePrivateKey(),
    },
  });
  assert.equal(result.targetKeyId, '0123456789abcdef0123456789abcdef01234567');
});

test('validateRetirementRequest rejects deleting the active Doppler key', () => {
  assert.throws(
    () => validateRetirementRequest({
      expectedEmail: 'app@example.iam.gserviceaccount.com',
      targetKeyId: '0123456789abcdef0123456789abcdef01234567',
      serviceAccount: {
        type: 'service_account',
        client_email: 'app@example.iam.gserviceaccount.com',
        private_key_id: '0123456789abcdef0123456789abcdef01234567',
        private_key: fakePrivateKey(),
      },
    }),
    /Refusing to retire the active Doppler key/,
  );
});

test('validateRetirementRequest rejects a different service account', () => {
  assert.throws(
    () => validateRetirementRequest({
      expectedEmail: 'expected@example.iam.gserviceaccount.com',
      targetKeyId: '0123456789abcdef0123456789abcdef01234567',
      serviceAccount: {
        type: 'service_account',
        client_email: 'other@example.iam.gserviceaccount.com',
        private_key_id: '89abcdef0123456789abcdef0123456789abcdef',
        private_key: fakePrivateKey(),
      },
    }),
    /service account does not match/,
  );
});

test('verifyKeyInventory requires both current and target user-managed keys before deletion', () => {
  const result = verifyKeyInventory({
    keys: [
      {
        name: 'projects/example/serviceAccounts/app@example.iam.gserviceaccount.com/keys/0123456789abcdef0123456789abcdef01234567',
        keyType: 'USER_MANAGED',
        disabled: false,
      },
      {
        name: 'projects/example/serviceAccounts/app@example.iam.gserviceaccount.com/keys/89abcdef0123456789abcdef0123456789abcdef',
        keyType: 'USER_MANAGED',
        disabled: false,
      },
    ],
    currentKeyId: '89abcdef0123456789abcdef0123456789abcdef',
    targetKeyId: '0123456789abcdef0123456789abcdef01234567',
    phase: 'before',
  });
  assert.equal(result.targetPresent, true);
  assert.equal(result.currentPresent, true);
});

test('verifyKeyInventory requires target absent and current present after deletion', () => {
  const result = verifyKeyInventory({
    keys: [
      {
        name: 'projects/example/serviceAccounts/app@example.iam.gserviceaccount.com/keys/89abcdef0123456789abcdef0123456789abcdef',
        keyType: 'USER_MANAGED',
        disabled: false,
      },
    ],
    currentKeyId: '89abcdef0123456789abcdef0123456789abcdef',
    targetKeyId: '0123456789abcdef0123456789abcdef01234567',
    phase: 'after',
  });
  assert.equal(result.targetPresent, false);
  assert.equal(result.currentPresent, true);
});


test('retireServiceAccountKey deletes only the requested legacy key and rechecks inventory', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const currentKeyId = '89abcdef0123456789abcdef0123456789abcdef';
  const targetKeyId = '0123456789abcdef0123456789abcdef01234567';
  const email = 'app@example.iam.gserviceaccount.com';
  const keyName = (id) => `projects/example/serviceAccounts/${email}/keys/${id}`;
  const calls = [];
  const responses = [
    { status: 200, body: { access_token: 'mock-access-token' } },
    {
      status: 200,
      body: {
        keys: [
          null,
          { name: keyName(targetKeyId), keyType: 'USER_MANAGED', disabled: false },
          { name: keyName(currentKeyId), keyType: 'USER_MANAGED', disabled: false },
        ],
      },
    },
    { status: 200, body: {} },
    {
      status: 200,
      body: {
        keys: [{ name: keyName(currentKeyId), keyType: 'USER_MANAGED', disabled: false }],
      },
    },
  ];
  const fetchFn = async (url, init = {}) => {
    calls.push({ method: init.method ?? 'GET', url: String(url) });
    const response = responses.shift();
    assert.ok(response, `Unexpected request: ${init.method ?? 'GET'} ${url}`);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      async text() {
        return JSON.stringify(response.body);
      },
    };
  };

  const result = await retireServiceAccountKey({
    expectedEmail: email,
    fetchFn,
    serviceAccount: {
      type: 'service_account',
      client_email: email,
      private_key_id: currentKeyId,
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    },
    targetKeyId,
  });

  assert.deepEqual(result, {
    activeKeyVerified: true,
    retiredKeyId: targetKeyId,
    serviceAccountEmail: email,
  });
  assert.equal(calls.length, 4);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /oauth2\.googleapis\.com\/token$/);
  assert.equal(calls[1].method, 'GET');
  assert.equal(calls[2].method, 'DELETE');
  assert.equal(calls[2].url, `https://iam.googleapis.com/v1/${keyName(targetKeyId)}`);
  assert.equal(calls[3].method, 'GET');
  assert.equal(responses.length, 0);
});
