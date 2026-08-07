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
  assert.throws(() => runner.parseArgs(['--serial', 'device-1', '--locale', 'de', '--apk', apk]), /--locale tr\|en/);
  assert.throws(() => runner.parseArgs(['--serial', 'device-1', '--locale', 'en', '--apk', 'relative.apk']), /absolute/i);
  assert.deepEqual(
    runner.parseBounds('<node text="Profil" clickable="true" bounds="[10,20][210,120]"/>', 'Profil'),
    { left: 10, top: 20, right: 210, bottom: 120 },
  );
  assert.deepEqual(
    runner.parseBounds(
      '<hierarchy><node clickable="true" bounds="[0,100][300,300]"><node text="Home" clickable="false" bounds="[50,220][120,250]"/></node></hierarchy>',
      'Home',
    ),
    { left: 0, top: 100, right: 300, bottom: 300 },
  );

  const source = fs.readFileSync(runnerPath, 'utf8');
  assert.match(source, /uiautomator/);
  assert.match(source, /parseBounds/);
  assert.match(source, /\['exec-out', 'screencap', '-p'\]/);
  assert.match(source, /assertApkPackage/);
  assert.match(source, /timeout: options\.timeoutMs \?\? 120_000/);
  assert.match(source, /killSignal: 'SIGKILL'/);
  assert.match(source, /monthlyReady: 'Aylık detaylar premium ile açılır\.'/);
  assert.match(source, /monthlyReady: 'Monthly details unlock with premium\.'/);
  assert.doesNotMatch(source, /pm['"],\s*['"]clear/);
});

test('tap helper resets toward the top then searches downward for an off-screen anchor', async () => {
  const runner = await import(`./capture-store-device-screenshots.mjs?scroll=${Date.now()}`);
  const calls = [];
  let searchedDown = false;
  const fakeAdb = async (_serial, args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined === 'shell wm size') return { stdout: 'Physical size: 1080x2160\n', stderr: '' };
    if (joined === 'shell cat /sdcard/window.xml') {
      return {
        stdout: searchedDown
          ? '<hierarchy><node text="Weekly" clickable="true" bounds="[10,20][210,120]"/></hierarchy>'
          : '<hierarchy></hierarchy>',
        stderr: '',
      };
    }
    if (args[0] === 'shell' && args[1] === 'input' && args[2] === 'swipe') {
      const startY = Number(args[4]);
      const endY = Number(args[6]);
      if (startY > endY) searchedDown = true;
      return { stdout: '', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };

  await runner.tapTextUsing('device-1', 'Weekly', fakeAdb, async () => {});

  const swipes = calls.filter((args) => args[0] === 'shell' && args[1] === 'input' && args[2] === 'swipe');
  assert.ok(swipes.some((args) => Number(args[4]) < Number(args[6])), 'must reset toward top');
  assert.ok(swipes.some((args) => Number(args[4]) > Number(args[6])), 'must search downward');
  assert.ok(calls.some((args) => args.slice(0, 3).join(' ') === 'shell input tap'));
});

test('mocked capture preserves production and writes six validated PNGs', async (t) => {
  const runner = await import(`./capture-store-device-screenshots.mjs?mock=${Date.now()}`);
  const calls = [];
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-store-capture-'));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const apk = path.resolve('/tmp/app-storeQa.apk');
  const allText = [
    'Bugünün Yorumu', 'Haftalık', 'Genel', 'Ana Sayfa', 'Aylık', 'Aylık detaylar premium ile açılır.',
    'Uyum', 'Uyum Analizi', 'Profil', 'Premium Durumu', 'Premium', 'Sınırsız Astroloji',
  ];
  const initiallyVisible = allText.filter((text) => !['Haftalık', 'Aylık'].includes(text));
  let scrolled = false;
  const xmlFor = (texts) => `<hierarchy>${texts.map((text, index) => `<node text="${text}" clickable="true" bounds="[${10 + index},20][${210 + index},120]"/>`).join('')}</hierarchy>`;

  const fakeAdb = async (_serial, args) => {
    calls.push(args);
    const joined = args.join(' ');
    if (joined === 'shell wm size') return { stdout: 'Physical size: 1080x2160\n', stderr: '' };
    if (joined === 'shell pm path com.parsfilo.astrology') return { stdout: 'package:/data/app/prod/base.apk\n', stderr: '' };
    if (joined === 'shell pm path com.parsfilo.astrology.storeqa') return { stdout: 'package:/data/app/qa/base.apk\n', stderr: '' };
    if (joined === 'shell dumpsys package com.parsfilo.astrology') {
      return { stdout: 'versionCode=1100\nversionName=1.0.100-smoke\nsignatures=[abc123]\n', stderr: '' };
    }
    if (joined.startsWith('shell input swipe ')) {
      scrolled = true;
      return { stdout: '', stderr: '' };
    }
    if (joined === 'shell cat /sdcard/window.xml') {
      return { stdout: xmlFor(scrolled ? allText : initiallyVisible), stderr: '' };
    }
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
  assert.ok(calls.some((args) => args[0] === 'shell' && args[1] === 'input' && args[2] === 'swipe'));
  assert.equal(calls.filter((args) => args.join(' ') === 'shell input keyevent KEYCODE_BACK').length, 2);
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
