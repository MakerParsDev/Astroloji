import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = path.resolve(process.env.ANDROID_RUNNER_TEMP ?? process.env.RUNNER_TEMP ?? os.tmpdir());
const dopplerJsonPath = process.env.DOPPLER_SECRETS_JSON_PATH;
const requireSigning = (process.env.REQUIRE_ANDROID_SIGNING ?? 'false').toLowerCase() === 'true';
const requireGoogleServices = (process.env.REQUIRE_GOOGLE_SERVICES_JSON ?? 'true').toLowerCase() === 'true';
const requirePlayServiceAccount = (process.env.REQUIRE_PLAY_SERVICE_ACCOUNT_JSON ?? 'true').toLowerCase() === 'true';

function isAndroidProjectRoot(candidatePath) {
  return (
    fs.existsSync(path.join(candidatePath, 'gradlew')) &&
    fs.existsSync(path.join(candidatePath, 'app', 'build.gradle.kts'))
  );
}

function resolveProjectRoot() {
  const configuredRoot = process.env.ANDROID_PROJECT_ROOT;
  const candidates = configuredRoot ? [configuredRoot] : ['.', 'Astroloji'];

  for (const candidate of candidates) {
    const resolvedCandidate = path.resolve(process.cwd(), candidate);
    if (isAndroidProjectRoot(resolvedCandidate)) {
      return resolvedCandidate;
    }
  }

  const fallbackRoot = path.resolve(process.cwd(), configuredRoot ?? 'Astroloji');
  return fallbackRoot;
}

const projectRoot = resolveProjectRoot();

function readDopplerSecrets() {
  if (!dopplerJsonPath || !fs.existsSync(dopplerJsonPath)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(dopplerJsonPath, 'utf8'));
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, value];
      }
      if (value && typeof value === 'object' && typeof value.computed === 'string') {
        return [key, value.computed];
      }
      return [key, ''];
    }),
  );
}

const dopplerSecrets = readDopplerSecrets();

function resolveSecret(name, aliases = []) {
  const keys = [name, ...aliases];
  for (const key of keys) {
    const direct = process.env[key];
    if (direct && direct.trim().length > 0) {
      return direct;
    }
    const dopplerValue = dopplerSecrets[key];
    if (dopplerValue && dopplerValue.trim().length > 0) {
      return dopplerValue;
    }
  }
  return '';
}

function requireValue(name, value) {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
}

function writeTextFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function validateRolloutFraction(rawValue) {
  if (!rawValue) {
    return;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue >= 1) {
    throw new Error('PLAY_USER_FRACTION must be greater than 0 and less than 1.');
  }
}

function toGradlePropertyValue(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

const googleServicesJson = resolveSecret('GOOGLE_SERVICES_JSON');
const playServiceAccountJson = resolveSecret('PLAY_SERVICE_ACCOUNT_JSON', ['GOOGLE_SERVICE_ACCOUNT_JSON']);
const keystoreBase64 = resolveSecret('ANDROID_KEYSTORE_BASE64');
const keystorePassword = resolveSecret('ANDROID_KEYSTORE_PASSWORD');
const keyAlias = resolveSecret('ANDROID_KEY_ALIAS');
const keyPassword = resolveSecret('ANDROID_KEY_PASSWORD');

if (requireGoogleServices) {
  requireValue('GOOGLE_SERVICES_JSON', googleServicesJson);
}

if (requirePlayServiceAccount) {
  requireValue('PLAY_SERVICE_ACCOUNT_JSON', playServiceAccountJson);
}

if (requireSigning) {
  requireValue('ANDROID_KEYSTORE_BASE64', keystoreBase64);
  requireValue('ANDROID_KEYSTORE_PASSWORD', keystorePassword);
  requireValue('ANDROID_KEY_ALIAS', keyAlias);
  requireValue('ANDROID_KEY_PASSWORD', keyPassword);
}

validateRolloutFraction(process.env.PLAY_USER_FRACTION);

if (googleServicesJson) {
  writeTextFile(path.join(projectRoot, 'app', 'google-services.json'), googleServicesJson);
}

let playServiceAccountPath = '';
if (playServiceAccountJson) {
  playServiceAccountPath = path.join(tempRoot, 'play-service-account.json');
  writeTextFile(playServiceAccountPath, playServiceAccountJson);
}

let keystorePath = '';
if (keystoreBase64) {
  keystorePath = path.join(tempRoot, 'upload-keystore.jks');
  fs.writeFileSync(keystorePath, Buffer.from(keystoreBase64, 'base64'));
}

const gradlePropertiesLines = [
  'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8',
  'org.gradle.daemon=false',
  'kotlin.code.style=official',
];

function appendIfPresent(key, value, aliases = []) {
  const resolved = value || resolveSecret(key, aliases);
  if (resolved) {
    gradlePropertiesLines.push(`${key}=${toGradlePropertyValue(resolved)}`);
  }
}

appendIfPresent('CRASHLYTICS_MAPPING_UPLOAD_ENABLED', process.env.CRASHLYTICS_MAPPING_UPLOAD_ENABLED);
appendIfPresent('PLAY_TRACK', process.env.PLAY_TRACK);
appendIfPresent('PLAY_RELEASE_STATUS', process.env.PLAY_RELEASE_STATUS);
appendIfPresent('PLAY_USER_FRACTION', process.env.PLAY_USER_FRACTION);
appendIfPresent('PLAY_RELEASE_NAME', process.env.PLAY_RELEASE_NAME);
appendIfPresent('VERSION_CODE', process.env.VERSION_CODE);
appendIfPresent('VERSION_NAME', process.env.VERSION_NAME);

if (playServiceAccountPath) {
  gradlePropertiesLines.push(
    `PLAY_SERVICE_ACCOUNT_JSON_PATH=${toGradlePropertyValue(playServiceAccountPath)}`,
  );
}

if (keystorePath) {
  gradlePropertiesLines.push(`ANDROID_KEYSTORE_PATH=${toGradlePropertyValue(keystorePath)}`);
  gradlePropertiesLines.push(
    `ANDROID_KEYSTORE_PASSWORD=${toGradlePropertyValue(keystorePassword)}`,
  );
  gradlePropertiesLines.push(`ANDROID_KEY_ALIAS=${toGradlePropertyValue(keyAlias)}`);
  gradlePropertiesLines.push(`ANDROID_KEY_PASSWORD=${toGradlePropertyValue(keyPassword)}`);
}

appendIfPresent('PRIVACY_POLICY_URL', process.env.PRIVACY_POLICY_URL);
appendIfPresent('TERMS_OF_USE_URL', process.env.TERMS_OF_USE_URL);
appendIfPresent('SUPPORT_EMAIL', process.env.SUPPORT_EMAIL);
appendIfPresent('ADMOB_APP_ID', process.env.ADMOB_APP_ID);
appendIfPresent('ADMOB_BANNER_ID', process.env.ADMOB_BANNER_ID);
appendIfPresent('ADMOB_INTERSTITIAL_ID', process.env.ADMOB_INTERSTITIAL_ID);
appendIfPresent('ADMOB_REWARDED_ID', process.env.ADMOB_REWARDED_ID);
appendIfPresent('ADMOB_REWARDED_INTERSTITIAL_ID', process.env.ADMOB_REWARDED_INTERSTITIAL_ID);
appendIfPresent('ADMOB_APP_OPEN_ID', process.env.ADMOB_APP_OPEN_ID);
appendIfPresent('ADMOB_NATIVE_ADVANCED_ID', process.env.ADMOB_NATIVE_ADVANCED_ID, ['ADMOB_NATIVE_ID']);

writeTextFile(path.join(projectRoot, 'gradle.properties'), `${gradlePropertiesLines.join('\n')}\n`);

console.log(
  JSON.stringify(
    {
      projectRoot,
      usedDoppler: Boolean(dopplerJsonPath && fs.existsSync(dopplerJsonPath)),
      wroteGoogleServicesJson: Boolean(googleServicesJson),
      wrotePlayServiceAccount: Boolean(playServiceAccountJson),
      wroteSigningConfig: Boolean(keystoreBase64),
    },
    null,
    2,
  ),
);
