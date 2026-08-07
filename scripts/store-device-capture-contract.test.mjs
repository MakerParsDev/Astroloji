import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const manifestPath = 'Astroloji/play/assets/source/device-scenes.json';
const runnerPath = 'scripts/capture-store-device-screenshots.mjs';

function fakePng(width = 1080, height = 2160) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test('scene manifest fixes six scenes and physical device dimensions', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.packageName, 'com.parsfilo.astrology.storeqa');
  assert.deepEqual(manifest.device, { width: 1080, height: 2160 });
  assert.deepEqual(manifest.scenes, [
    { id: 'daily', order: 1 },
    { id: 'weekly', order: 2 },
    { id: 'monthly', order: 3 },
    { id: 'compatibility', order: 4 },
    { id: 'profile', order: 5 },
    { id: 'premium', order: 6 },
  ]);
});

test('runner exposes safe argument, bounds, screenshot, and navigation contracts', async () => {
  assert.ok(fs.existsSync(runnerPath), 'physical-device capture runner must exist');
  const runner = await import(`./capture-store-device-screenshots.mjs?contract=${Date.now()}`);
  const apk = path.resolve('/tmp/app-storeQa.apk');

  assert.deepEqual(runner.parseArgs(['--serial', 'device-1', '--locale', 'tr', '--apk', apk]), {
    serial: 'device-1', locale: 'tr', apk,
  });
  assert.throws(() => runner.parseArgs(['--serial', 'device-1', '--locale', 'de', '--apk', apk]), /tr|en/);
  assert.throws(() => runner.parseArgs(['--serial', 'device-1', '--locale', 'en', '--apk', 'relative.apk']), /absolute/i);
  assert.deepEqual(
    runner.parseBounds('<node text="Profil" clickable="true" bounds="[10,20][210,120]"/>', 'Profil'),
    { left: 10, top: 20, right: 210, bottom: 120 },
  );

  const source = fs.readFileSync(runnerPath, 'utf8');
  assert.match(source, /uiautomator/);
  assert.match(source, /parseBounds/);
  assert.match(source, /\['exec-out', 'screencap', '-p'\]/);
  assert.match(source, /assertApkPackage/);
  assert.doesNotMatch(source, /pm['"],\s*['"]clear/);
});

test('mocked capture preserves production and writes six validated PNGs', async () => {
  const runner = await import(`./capture-store-device-screenshots.mjs?mock=${Date.now()}`);
  const calls = [];
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-store-capture-'));
  const apk = path.resolve('/tmp/app-storeQa.apk');
  const allText = [
    'Bugünün Yorumu', 'Haftalık', 'Genel', 'Ana Sayfa', 'Aylık', 'Takvim görünümü',
    'Uyum', 'Uyum Analizi', 'Profil', 'Premium Durumu', 'Premium', 'Sınırsız Astroloji',
  ];
  const xml = `<hierarchy>${allText.map((text, index) => `<node text="${text}" clickable="true" bounds="[${10 + index},20][${210 + index},120]"/>`).join('')}</hierarchy>`;

  const fakeAdb = async (_serial, args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined === 'shell wm size') return { stdout: 'Physical size: 1080x2160\n', stderr: '' };
    if (joined === 'shell pm path com.parsfilo.astrology') return { stdout: 'package:/data/app/prod/base.apk\n', stderr: '' };
    if (joined === 'shell pm path com.parsfilo.astrology.storeqa') return { stdout: 'package:/data/app/qa/base.apk\n', stderr: '' };
    if (joined === 'shell dumpsys package com.parsfilo.astrology') {
      return { stdout: 'versionCode=1100\nversionName=1.0.100-smoke\nsignatures=[abc123]\n', stderr: '' };
    }
    if (joined === 'shell cat /sdcard/window.xml') return { stdout: xml, stderr: '' };
    return { stdout: '', stderr: '' };
  };

  await runner.captureStoreScreenshots(
    { serial: 'device-1', locale: 'tr', apk },
    {
      adb: fakeAdb,
      apkPackage: async () => 'com.parsfilo.astrology.storeqa',
      outputDir,
      sleep: async () => {},
      capturePng: async (_serial, destination) => fs.writeFileSync(destination, fakePng()),
    },
  );

  assert.deepEqual(
    fs.readdirSync(outputDir).sort(),
    ['compatibility', 'daily', 'monthly', 'premium', 'profile', 'weekly'].map((scene) => `store_capture_tr_${scene}.png`).sort(),
  );
  const installCalls = calls.filter((args) => args[0] === 'install');
  assert.equal(installCalls.length, 1);
  assert.deepEqual(installCalls[0].slice(0, 2), ['install', '-r']);
  assert.ok(!installCalls[0].includes('com.parsfilo.astrology'));
  assert.equal(calls.filter((args) => args.join(' ') === 'shell pm path com.parsfilo.astrology').length, 2);
  assert.equal(calls.filter((args) => args.join(' ') === 'shell dumpsys package com.parsfilo.astrology').length, 2);
  assert.ok(calls.some((args) => args.join(' ') === 'shell am force-stop com.parsfilo.astrology.storeqa'));
  assert.ok(calls.some((args) => args[0] === 'shell' && args[1] === 'input' && args[2] === 'tap'));
  assert.ok(!calls.some((args) => args.includes('clear') || args.includes('uninstall')));
});

test('mocked capture rejects a device with the wrong physical size before install', async () => {
  const runner = await import(`./capture-store-device-screenshots.mjs?size=${Date.now()}`);
  const calls = [];
  await assert.rejects(
    runner.captureStoreScreenshots(
      { serial: 'device-1', locale: 'en', apk: path.resolve('/tmp/app-storeQa.apk') },
      {
        adb: async (_serial, args) => {
          calls.push(args);
          if (args.join(' ') === 'shell wm size') return { stdout: 'Physical size: 1080x2400\n', stderr: '' };
          return { stdout: '', stderr: '' };
        },
        apkPackage: async () => 'com.parsfilo.astrology.storeqa',
      },
    ),
    /1080x2160/,
  );
  assert.equal(calls.filter((args) => args[0] === 'install').length, 0);
});
