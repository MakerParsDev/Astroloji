import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportPlayAssets } from './export-play-assets.mjs';
import { sha256 } from './lib/play-assets.mjs';

function png(width, height, uniqueByte) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  buffer[32] = uniqueByte;
  return buffer;
}

const previewNames = [
  ['StoreAppIconScreenshot', 512, 512],
  ['StoreFeatureGraphicEnglishScreenshot', 1024, 500],
  ['StoreDailyEnglishScreenshot', 1080, 1920],
  ['StoreGuidanceEnglishScreenshot', 1080, 1920],
  ['StoreCompatibilityEnglishScreenshot', 1080, 1920],
  ['StorePersonalityEnglishScreenshot', 1080, 1920],
  ['StoreToolsEnglishScreenshot', 1080, 1920],
  ['StorePremiumEnglishScreenshot', 1080, 1920],
  ['StoreFeatureGraphicTurkishScreenshot', 1024, 500],
  ['StoreDailyTurkishScreenshot', 1080, 1920],
  ['StoreGuidanceTurkishScreenshot', 1080, 1920],
  ['StoreCompatibilityTurkishScreenshot', 1080, 1920],
  ['StorePersonalityTurkishScreenshot', 1080, 1920],
  ['StoreToolsTurkishScreenshot', 1080, 1920],
  ['StorePremiumTurkishScreenshot', 1080, 1920],
];

const expectedPaths = [
  'shared/icon/icon.png',
  'en-US/featureGraphic/feature-graphic.png',
  'en-US/phoneScreenshots/01-daily.png',
  'en-US/phoneScreenshots/02-guidance.png',
  'en-US/phoneScreenshots/03-compatibility.png',
  'en-US/phoneScreenshots/04-personality.png',
  'en-US/phoneScreenshots/05-tools.png',
  'en-US/phoneScreenshots/06-premium.png',
  'tr-TR/featureGraphic/feature-graphic.png',
  'tr-TR/phoneScreenshots/01-daily.png',
  'tr-TR/phoneScreenshots/02-guidance.png',
  'tr-TR/phoneScreenshots/03-compatibility.png',
  'tr-TR/phoneScreenshots/04-personality.png',
  'tr-TR/phoneScreenshots/05-tools.png',
  'tr-TR/phoneScreenshots/06-premium.png',
];

function sourceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-export-source-'));
  previewNames.forEach(([name, width, height], index) => {
    const dir = path.join(root, index % 2 === 0 ? 'a' : 'b');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}_hash_0.png`), png(width, height, index + 1));
  });
  return root;
}

test('exporter maps verified golden previews to deterministic Play paths', () => {
  const sourceRoot = sourceFixture();
  const outputRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'play-export-one-')), 'assets');
  const exported = exportPlayAssets({ sourceRoot, outputRoot });
  assert.deepEqual(exported.map((item) => item.path), expectedPaths);
  for (const asset of exported) {
    assert.equal(sha256(path.join(outputRoot, asset.path)), asset.sha256);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(outputRoot, '..', 'asset-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.assets, exported);
});

test('exporter is byte-for-byte deterministic across two runs', () => {
  const sourceRoot = sourceFixture();
  const firstRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'play-export-a-')), 'assets');
  const secondRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'play-export-b-')), 'assets');
  const first = exportPlayAssets({ sourceRoot, outputRoot: firstRoot });
  const second = exportPlayAssets({ sourceRoot, outputRoot: secondRoot });
  assert.deepEqual(first, second);
  for (const asset of first) {
    assert.equal(sha256(path.join(firstRoot, asset.path)), sha256(path.join(secondRoot, asset.path)));
  }
});

test('exporter rejects missing or ambiguous golden previews', () => {
  const sourceRoot = sourceFixture();
  const sourceFiles = fs.readdirSync(sourceRoot, { recursive: true });
  const dailyRelative = sourceFiles.find((name) => String(name).includes('StoreDailyEnglishScreenshot'));
  const dailySource = path.join(sourceRoot, String(dailyRelative));
  fs.copyFileSync(dailySource, path.join(sourceRoot, 'duplicate-StoreDailyEnglishScreenshot.png'));
  const outputRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'play-export-error-')), 'assets');
  assert.throws(() => exportPlayAssets({ sourceRoot, outputRoot }), /ambiguous golden preview/i);
});
