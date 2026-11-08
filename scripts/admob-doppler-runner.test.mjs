import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve('backend/scripts/run-admob-verification-challenge.sh');
const sampleUser = 'admob-verify-11111111-1111-4111-8111-111111111111';
const sampleData = '22222222-2222-4222-8222-222222222222';

function runMock(operation, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-ssv-doppler-'));
  try {
    const doppler = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf "%s\\n" "$3" >> "$FAKE_DOPPLER_READS"',
      'case "$3" in',
      '  ADMOB_SSV_TEST_CUSTOM_DATA)',
      '    if [ "$FAKE_BAD_CUSTOM" = 1 ]; then printf "bad-custom"; else printf "22222222-2222-4222-8222-222222222222"; fi ;;',
      '  ADMOB_SSV_TEST_USER_ID)',
      '    if [ "$FAKE_BAD_USER" = 1 ]; then printf "other-user"; else printf "admob-verify-11111111-1111-4111-8111-111111111111"; fi ;;',
      '  CLOUDFLARE_API_TOKEN) printf "fake-cloudflare-token" ;;',
      '  *) exit 42 ;;',
      'esac'
    ].join('\n') + '\n';
    const npm = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'test -z "${DOPPLER_TOKEN:-}"',
      'test "$ADMOB_SSV_TEST_USER_ID" = "admob-verify-11111111-1111-4111-8111-111111111111"',
      'test "$ADMOB_SSV_TEST_CUSTOM_DATA" = "22222222-2222-4222-8222-222222222222"',
      'test "$CLOUDFLARE_API_TOKEN" = "fake-cloudflare-token"',
      'printf "%s\\n" "$*" > "$FAKE_NPM_CAPTURE"',
      'printf "{\\"operation\\":\\"create\\",\\"status\\":\\"pending\\"}\\n"'
    ].join('\n') + '\n';
    const binDir = path.join(directory, 'bin');
    fs.mkdirSync(binDir);
    for (const [name, content] of [['doppler', doppler], ['npm', npm]]) {
      fs.writeFileSync(path.join(binDir, name), content, { mode: 0o700 });
    }
    const reads = path.join(directory, 'reads');
    const npmCapture = path.join(directory, 'npm');
    const result = spawnSync('bash', [script, operation], {
      encoding: 'utf8',
      cwd: path.dirname(script),
      env: {
        ...process.env,
        PATH: binDir + path.delimiter + process.env.PATH,
        DOPPLER_TOKEN: 'mock-doppler-token',
        DOPPLER_PROJECT: 'mobil-apps',
        DOPPLER_CONFIG: 'astrology',
        FAKE_DOPPLER_READS: reads,
        FAKE_NPM_CAPTURE: npmCapture,
        FAKE_BAD_CUSTOM: '0',
        FAKE_BAD_USER: '0',
        ...overrides
      }
    });
    return {
      result,
      reads: fs.existsSync(reads) ? fs.readFileSync(reads, 'utf8') : '',
      npm: fs.existsSync(npmCapture) ? fs.readFileSync(npmCapture, 'utf8') : ''
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('validate reads synthetic test IDs only, never queries Cloudflare or invokes npm', () => {
  const { result, reads, npm } = runMock('validate');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { operation: 'validate', secretsReady: true });
  assert.match(reads, /ADMOB_SSV_TEST_CUSTOM_DATA/);
  assert.match(reads, /ADMOB_SSV_TEST_USER_ID/);
  assert.doesNotMatch(reads, /CLOUDFLARE_API_TOKEN/);
  assert.equal(npm, '');
  assert.ok(result.stderr.split('\n').filter((line) =>
    line.includes(sampleData) || line.includes(sampleUser)
  ).every((line) => line.startsWith('::add-mask::')));
  assert.doesNotMatch(result.stdout, /admob-verify-|22222222/);
});

test('invalid Doppler custom data fails closed before a cloud token read or npm', () => {
  const { result, reads, npm } = runMock('validate', { FAKE_BAD_CUSTOM: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UUID/);
  assert.doesNotMatch(reads, /CLOUDFLARE_API_TOKEN/);
  assert.equal(npm, '');
  assert.equal(result.stdout, '');
});

test('invalid Doppler user namespace fails before cloud token access and does not leak the value', () => {
  const { result, reads, npm } = runMock('validate', { FAKE_BAD_USER: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /namespace/);
  assert.doesNotMatch(result.stdout + result.stderr, /other-user/);
  assert.doesNotMatch(reads, /CLOUDFLARE_API_TOKEN/);
  assert.equal(npm, '');
});

test('create passes validated synthetic values to the existing npm operation without Doppler token', () => {
  const { result, reads, npm } = runMock('create');
  assert.equal(result.status, 0, result.stderr);
  assert.match(reads, /CLOUDFLARE_API_TOKEN/);
  assert.equal(npm.trim(), 'run --silent transition:challenge:create');
  assert.deepEqual(JSON.parse(result.stdout), { operation: 'create', status: 'pending' });
  assert.doesNotMatch(result.stdout, /admob-verify-|22222222|fake-cloudflare-token/);
});

test('unknown operation fails before reading any provider secret', () => {
  const { result, reads, npm } = runMock('erase-production');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid SSV challenge operation/);
  assert.equal(reads, '');
  assert.equal(npm, '');
});
