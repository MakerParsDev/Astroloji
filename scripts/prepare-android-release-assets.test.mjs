import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, 'scripts', 'prepare-android-release-assets.mjs');

function createAndroidProject(baseDir) {
  fs.mkdirSync(path.join(baseDir, 'app'), { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'gradlew'), '', 'utf8');
  fs.writeFileSync(path.join(baseDir, 'app', 'build.gradle.kts'), '', 'utf8');
}

function runScript(cwd, overrides = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-release-assets-'));
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd,
    env: {
      ...process.env,
      ANDROID_RUNNER_TEMP: tempRoot,
      GOOGLE_SERVICES_JSON: '{"project_info":{}}',
      PLAY_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
      ANDROID_KEYSTORE_BASE64: Buffer.from('fake-keystore').toString('base64'),
      ANDROID_KEYSTORE_PASSWORD: 'keystore-pass',
      ANDROID_KEY_ALIAS: 'upload',
      ANDROID_KEY_PASSWORD: 'key-pass',
      ...overrides,
    },
    encoding: 'utf8',
  });

  return {
    result,
    gradlePropertiesPath:
      fs.existsSync(path.join(cwd, 'gradlew')) &&
        fs.existsSync(path.join(cwd, 'app', 'build.gradle.kts'))
        ? path.join(cwd, 'gradle.properties')
        : path.join(cwd, 'Astroloji', 'gradle.properties'),
  };
}

test('uses current working directory when already at the Android project root', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-project-root-'));
  createAndroidProject(projectRoot);

  const { result } = runScript(projectRoot);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.ok(fs.existsSync(path.join(projectRoot, 'gradle.properties')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'app', 'google-services.json')));
  assert.equal(fs.existsSync(path.join(projectRoot, 'Astroloji', 'gradle.properties')), false);
});

test('falls back to the Astroloji subdirectory when executed from repository root', () => {
  const repoTempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-repo-root-'));
  const projectRoot = path.join(repoTempRoot, 'Astroloji');
  createAndroidProject(projectRoot);

  const { result } = runScript(repoTempRoot);

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.ok(fs.existsSync(path.join(projectRoot, 'gradle.properties')));
  assert.ok(fs.existsSync(path.join(projectRoot, 'app', 'google-services.json')));
});

test('escapes backslashes and newlines before writing gradle.properties', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-escaped-properties-'));
  createAndroidProject(projectRoot);

  const { result, gradlePropertiesPath } = runScript(projectRoot, {
    ANDROID_KEYSTORE_PASSWORD: 'store\\pass\nnext',
    ANDROID_KEY_PASSWORD: 'key\\pass\nnext',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const contents = fs.readFileSync(gradlePropertiesPath, 'utf8');

  assert.match(contents, /ANDROID_KEYSTORE_PASSWORD=store\\\\pass\\nnext/);
  assert.match(contents, /ANDROID_KEY_PASSWORD=key\\\\pass\\nnext/);
});

test('writes release name into gradle.properties when provided', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-release-name-'));
  createAndroidProject(projectRoot);

  const { result, gradlePropertiesPath } = runScript(projectRoot, {
    PLAY_RELEASE_NAME: 'Astroloji 1.0.1',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const contents = fs.readFileSync(gradlePropertiesPath, 'utf8');

  assert.match(contents, /PLAY_RELEASE_NAME=Astroloji 1\.0\.1/);
});

test('fails fast when rollout fraction is outside the valid range', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-invalid-fraction-'));
  createAndroidProject(projectRoot);

  const { result } = runScript(projectRoot, {
    PLAY_USER_FRACTION: '1.2',
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stderr}\n${result.stdout}`,
    /PLAY_USER_FRACTION must be greater than 0 and less than 1/i,
  );
});
