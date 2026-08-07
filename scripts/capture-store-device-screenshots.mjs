import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const manifestPath = path.join(repoRoot, 'Astroloji/play/assets/source/device-scenes.json');
const defaultOutputDir = path.join(repoRoot, 'Astroloji/app/src/screenshotTest/res/drawable-nodpi');
const productionPackage = 'com.parsfilo.astrology';
const qaPackage = 'com.parsfilo.astrology.storeqa';
const qaActivity = 'com.parsfilo.astrology.storeqa.StoreQaBootstrapActivity';
const expectedScenes = ['daily', 'weekly', 'monthly', 'compatibility', 'profile', 'premium'];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const anchors = {
  tr: {
    home: 'Bugünün Yorumu',
    weeklyButton: 'Haftalık',
    weeklyReady: 'Genel',
    homeNav: 'Ana Sayfa',
    monthlyButton: 'Aylık',
    monthlyReady: 'Takvim görünümü',
    compatibilityNav: 'Uyum',
    compatibilityReady: 'Uyum Analizi',
    profileNav: 'Profil',
    profileReady: 'Premium Durumu',
    premiumNav: 'Premium',
    premiumReady: 'Sınırsız Astroloji',
  },
  en: {
    home: 'Today’s Horoscope',
    weeklyButton: 'Weekly',
    weeklyReady: 'Overview',
    homeNav: 'Home',
    monthlyButton: 'Monthly',
    monthlyReady: 'Calendar view',
    compatibilityNav: 'Compatibility',
    compatibilityReady: 'Compatibility Reading',
    profileNav: 'Profile',
    profileReady: 'Premium Status',
    premiumNav: 'Premium',
    premiumReady: 'Unlimited Astrology',
  },
};

function execFileResult(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        encoding: options.encoding ?? 'utf8',
        maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024,
        env: options.env ?? process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value == null) {
      throw new Error('Usage: --serial <adbSerial> --locale tr|en --apk <absoluteApkPath>');
    }
    values[key.slice(2)] = value;
  }
  const { serial, locale, apk } = values;
  if (!serial || !apk || !['tr', 'en'].includes(locale)) {
    throw new Error('Required arguments: --serial <adbSerial> --locale tr|en --apk <absoluteApkPath>');
  }
  if (!path.isAbsolute(apk)) {
    throw new Error('--apk must be an absolute path');
  }
  return { serial, locale, apk };
}

export async function adb(serial, args, options = {}) {
  return execFileResult('adb', ['-s', serial, ...args], options);
}

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function nodeAttributes(node) {
  const attributes = {};
  for (const match of node.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

export function parseBounds(xml, visibleText) {
  const matches = [...xml.matchAll(/<node\b[^>]*>/g)]
    .map((match) => nodeAttributes(match[0]))
    .filter((attrs) => attrs.text === visibleText || attrs['content-desc'] === visibleText)
    .filter((attrs) => /^\[\d+,\d+\]\[\d+,\d+\]$/.test(attrs.bounds ?? ''));
  const attrs = matches.find((candidate) => candidate.clickable === 'true') ?? matches[0];
  if (!attrs) {
    throw new Error(`Visible text not found in UI hierarchy: ${visibleText}`);
  }
  const bounds = attrs.bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!bounds) throw new Error(`Invalid bounds for ${visibleText}: ${attrs.bounds}`);
  return {
    left: Number(bounds[1]),
    top: Number(bounds[2]),
    right: Number(bounds[3]),
    bottom: Number(bounds[4]),
  };
}

async function uiXml(serial, adbFn) {
  await adbFn(serial, ['shell', 'uiautomator', 'dump', '/sdcard/window.xml']);
  const { stdout } = await adbFn(serial, ['shell', 'cat', '/sdcard/window.xml']);
  return String(stdout);
}

async function tapTextUsing(serial, visibleText, adbFn) {
  const bounds = parseBounds(await uiXml(serial, adbFn), visibleText);
  const x = Math.floor((bounds.left + bounds.right) / 2);
  const y = Math.floor((bounds.top + bounds.bottom) / 2);
  await adbFn(serial, ['shell', 'input', 'tap', String(x), String(y)]);
}

export async function tapText(serial, visibleText) {
  return tapTextUsing(serial, visibleText, adb);
}

const defaultSleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForTextUsing(serial, visibleText, timeoutMs, adbFn, sleepFn) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      parseBounds(await uiXml(serial, adbFn), visibleText);
      return;
    } catch (error) {
      lastError = error;
      await sleepFn(300);
    }
  }
  throw new Error(`Timed out waiting for UI text: ${visibleText}. ${lastError?.message ?? ''}`);
}

export async function waitForText(serial, visibleText, timeoutMs = 15000) {
  return waitForTextUsing(serial, visibleText, timeoutMs, adb, defaultSleep);
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Capture is not a PNG');
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('PNG is missing IHDR');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function assertPngFile(destination, width, height) {
  const dimensions = pngDimensions(fs.readFileSync(destination));
  if (dimensions.width !== width || dimensions.height !== height) {
    throw new Error(
      `${path.basename(destination)} must be ${width}x${height}, got ${dimensions.width}x${dimensions.height}`,
    );
  }
}

async function capturePngUsing(serial, destination, adbFn) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const { stdout } = await adbFn(serial, ['exec-out', 'screencap', '-p'], { encoding: null });
  if (!Buffer.isBuffer(stdout)) throw new Error('adb screencap did not return binary PNG data');
  fs.writeFileSync(destination, stdout);
}

export async function capturePng(serial, destination) {
  await capturePngUsing(serial, destination, adb);
}

async function assertPackageInstalledUsing(serial, packageName, adbFn) {
  const { stdout } = await adbFn(serial, ['shell', 'pm', 'path', packageName]);
  if (!String(stdout).split(/\r?\n/).some((line) => line.startsWith('package:'))) {
    throw new Error(`Required package is not installed: ${packageName}`);
  }
}

export async function assertPackageInstalled(serial, packageName) {
  return assertPackageInstalledUsing(serial, packageName, adb);
}

function findApkAnalyzer() {
  const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  const candidates = [
    process.env.APKANALYZER,
    sdkRoot && path.join(sdkRoot, 'cmdline-tools/latest/bin/apkanalyzer'),
    path.join(os.homedir(), 'Android/Sdk/cmdline-tools/latest/bin/apkanalyzer'),
    'apkanalyzer',
  ].filter(Boolean);
  return candidates.find((candidate) => candidate === 'apkanalyzer' || fs.existsSync(candidate));
}

export async function assertApkPackage(apk, expectedPackage) {
  const analyzer = findApkAnalyzer();
  const { stdout } = await execFileResult(analyzer, ['manifest', 'application-id', apk]);
  const actual = String(stdout).trim();
  if (actual !== expectedPackage) {
    throw new Error(`Refusing to install APK package ${actual || '<unknown>'}; expected ${expectedPackage}`);
  }
  return actual;
}

async function productionSnapshot(serial, adbFn) {
  await assertPackageInstalledUsing(serial, productionPackage, adbFn);
  const { stdout } = await adbFn(serial, ['shell', 'dumpsys', 'package', productionPackage]);
  const lines = String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(versionCode=|versionName=|apkSigningVersion=|signatures=)/.test(line));
  if (!lines.some((line) => line.startsWith('versionCode=')) || !lines.some((line) => line.startsWith('signatures='))) {
    throw new Error('Could not record production version/signature snapshot');
  }
  return lines.join('\n');
}

async function assertPhysicalSize(serial, expected, adbFn) {
  const { stdout } = await adbFn(serial, ['shell', 'wm', 'size']);
  const match = String(stdout).match(/Physical size:\s*(\d+)x(\d+)/);
  if (!match) throw new Error('Could not read physical device size');
  const actual = { width: Number(match[1]), height: Number(match[2]) };
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`Physical device must be ${expected.width}x${expected.height}, got ${actual.width}x${actual.height}`);
  }
}

function readSceneManifest() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.packageName, qaPackage);
  assert.deepEqual(manifest.scenes.map((scene) => scene.id), expectedScenes);
  assert.deepEqual(manifest.scenes.map((scene) => scene.order), [1, 2, 3, 4, 5, 6]);
  return manifest;
}

export async function captureStoreScreenshots(config, dependencies = {}) {
  const { serial, locale, apk } = config;
  if (!['tr', 'en'].includes(locale)) throw new Error('locale must be exactly tr or en');
  if (!path.isAbsolute(apk)) throw new Error('APK path must be absolute');

  const manifest = readSceneManifest();
  const adbFn = dependencies.adb ?? adb;
  const apkPackageFn = dependencies.apkPackage ?? ((candidate) => assertApkPackage(candidate, qaPackage));
  const sleepFn = dependencies.sleep ?? defaultSleep;
  const outputDir = dependencies.outputDir ?? defaultOutputDir;
  const captureFn = dependencies.capturePng ?? ((deviceSerial, destination) => capturePngUsing(deviceSerial, destination, adbFn));
  const text = anchors[locale];

  await assertPhysicalSize(serial, manifest.device, adbFn);
  const apkPackage = await apkPackageFn(apk);
  if (apkPackage !== qaPackage) throw new Error(`Refusing to install non-QA APK: ${apkPackage}`);
  const productionBefore = await productionSnapshot(serial, adbFn);

  await adbFn(serial, ['install', '-r', apk]);
  await assertPackageInstalledUsing(serial, qaPackage, adbFn);
  await adbFn(serial, ['shell', 'am', 'force-stop', qaPackage]);
  await adbFn(serial, [
    'shell', 'am', 'start', '-W', '-n', `${qaPackage}/${qaActivity}`, '--es', 'locale', locale,
  ]);
  await waitForTextUsing(serial, text.home, 15000, adbFn, sleepFn);

  const capture = async (scene) => {
    const destination = path.join(outputDir, `store_capture_${locale}_${scene}.png`);
    fs.mkdirSync(outputDir, { recursive: true });
    await sleepFn(350);
    await captureFn(serial, destination);
    assertPngFile(destination, manifest.device.width, manifest.device.height);
  };

  await capture('daily');
  await tapTextUsing(serial, text.weeklyButton, adbFn);
  await waitForTextUsing(serial, text.weeklyReady, 15000, adbFn, sleepFn);
  await capture('weekly');

  await tapTextUsing(serial, text.homeNav, adbFn);
  await waitForTextUsing(serial, text.home, 15000, adbFn, sleepFn);
  await tapTextUsing(serial, text.monthlyButton, adbFn);
  await waitForTextUsing(serial, text.monthlyReady, 15000, adbFn, sleepFn);
  await capture('monthly');

  await tapTextUsing(serial, text.compatibilityNav, adbFn);
  await waitForTextUsing(serial, text.compatibilityReady, 15000, adbFn, sleepFn);
  await capture('compatibility');

  await tapTextUsing(serial, text.profileNav, adbFn);
  await waitForTextUsing(serial, text.profileReady, 15000, adbFn, sleepFn);
  await capture('profile');

  await tapTextUsing(serial, text.premiumNav, adbFn);
  await waitForTextUsing(serial, text.premiumReady, 15000, adbFn, sleepFn);
  await capture('premium');

  const productionAfter = await productionSnapshot(serial, adbFn);
  if (productionAfter !== productionBefore) {
    throw new Error('Production package version/signature changed during QA capture');
  }

  return manifest.scenes.map((scene) => path.join(outputDir, `store_capture_${locale}_${scene.id}.png`));
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = await captureStoreScreenshots(config);
  for (const output of outputs) console.log(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
