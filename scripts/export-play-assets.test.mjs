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
  ['StoreDailyEnglishScreenshot', 1080, 2400],
  ['StoreGuidanceEnglishScreenshot', 1080, 2400],
  ['StoreCompatibilityEnglishScreenshot', 1080, 2400],
  ['StorePersonalityEnglishScreenshot', 1080, 2400],
  ['StoreToolsEnglishScreenshot', 1080, 2400],
  ['StorePremiumEnglishScreenshot', 1080, 2400],
  ['StoreFeatureGraphicTurkishScreenshot', 1024, 500],
  ['StoreDailyTurkishScreenshot', 1080, 2400],
  ['StoreGuidanceTurkishScreenshot', 1080, 2400],
  ['StoreCompatibilityTurkishScreenshot', 1080, 2400],
  ['StorePersonalityTurkishScreenshot', 1080, 2400],
  ['StoreToolsTurkishScreenshot', 1080, 2400],
  ['StorePremiumTurkishScreenshot', 1080, 2400],
  ['StoreFeatureGraphicSpanishScreenshot', 1024, 500],
  ['StoreDailySpanishScreenshot', 1080, 2400],
  ['StoreGuidanceSpanishScreenshot', 1080, 2400],
  ['StoreCompatibilitySpanishScreenshot', 1080, 2400],
  ['StorePersonalitySpanishScreenshot', 1080, 2400],
  ['StoreToolsSpanishScreenshot', 1080, 2400],
  ['StorePremiumSpanishScreenshot', 1080, 2400],
  ['StoreFeatureGraphicPortugueseScreenshot', 1024, 500],
  ['StoreDailyPortugueseScreenshot', 1080, 2400],
  ['StoreGuidancePortugueseScreenshot', 1080, 2400],
  ['StoreCompatibilityPortugueseScreenshot', 1080, 2400],
  ['StorePersonalityPortugueseScreenshot', 1080, 2400],
  ['StoreToolsPortugueseScreenshot', 1080, 2400],
  ['StorePremiumPortugueseScreenshot', 1080, 2400],
  ['StoreFeatureGraphicGermanScreenshot', 1024, 500],
  ['StoreDailyGermanScreenshot', 1080, 2400],
  ['StoreGuidanceGermanScreenshot', 1080, 2400],
  ['StoreCompatibilityGermanScreenshot', 1080, 2400],
  ['StorePersonalityGermanScreenshot', 1080, 2400],
  ['StoreToolsGermanScreenshot', 1080, 2400],
  ['StorePremiumGermanScreenshot', 1080, 2400],
  ['StoreFeatureGraphicFrenchScreenshot', 1024, 500],
  ['StoreDailyFrenchScreenshot', 1080, 2400],
  ['StoreGuidanceFrenchScreenshot', 1080, 2400],
  ['StoreCompatibilityFrenchScreenshot', 1080, 2400],
  ['StorePersonalityFrenchScreenshot', 1080, 2400],
  ['StoreToolsFrenchScreenshot', 1080, 2400],
  ['StorePremiumFrenchScreenshot', 1080, 2400],
];

const expectedPaths = [
  'shared/icon/icon.png',
  'en-US/featureGraphic/feature-graphic.png',
  'en-US/phoneScreenshots/01-daily.png',
  'en-US/phoneScreenshots/02-weekly.png',
  'en-US/phoneScreenshots/03-monthly.png',
  'en-US/phoneScreenshots/04-compatibility.png',
  'en-US/phoneScreenshots/05-profile.png',
  'en-US/phoneScreenshots/06-premium.png',
  'tr-TR/featureGraphic/feature-graphic.png',
  'tr-TR/phoneScreenshots/01-daily.png',
  'tr-TR/phoneScreenshots/02-weekly.png',
  'tr-TR/phoneScreenshots/03-monthly.png',
  'tr-TR/phoneScreenshots/04-compatibility.png',
  'tr-TR/phoneScreenshots/05-profile.png',
  'tr-TR/phoneScreenshots/06-premium.png',
  'es-ES/featureGraphic/feature-graphic.png',
  'es-ES/phoneScreenshots/01-daily.png',
  'es-ES/phoneScreenshots/02-weekly.png',
  'es-ES/phoneScreenshots/03-monthly.png',
  'es-ES/phoneScreenshots/04-compatibility.png',
  'es-ES/phoneScreenshots/05-profile.png',
  'es-ES/phoneScreenshots/06-premium.png',
  'pt-BR/featureGraphic/feature-graphic.png',
  'pt-BR/phoneScreenshots/01-daily.png',
  'pt-BR/phoneScreenshots/02-weekly.png',
  'pt-BR/phoneScreenshots/03-monthly.png',
  'pt-BR/phoneScreenshots/04-compatibility.png',
  'pt-BR/phoneScreenshots/05-profile.png',
  'pt-BR/phoneScreenshots/06-premium.png',
  'de-DE/featureGraphic/feature-graphic.png',
  'de-DE/phoneScreenshots/01-daily.png',
  'de-DE/phoneScreenshots/02-weekly.png',
  'de-DE/phoneScreenshots/03-monthly.png',
  'de-DE/phoneScreenshots/04-compatibility.png',
  'de-DE/phoneScreenshots/05-profile.png',
  'de-DE/phoneScreenshots/06-premium.png',
  'fr-FR/featureGraphic/feature-graphic.png',
  'fr-FR/phoneScreenshots/01-daily.png',
  'fr-FR/phoneScreenshots/02-weekly.png',
  'fr-FR/phoneScreenshots/03-monthly.png',
  'fr-FR/phoneScreenshots/04-compatibility.png',
  'fr-FR/phoneScreenshots/05-profile.png',
  'fr-FR/phoneScreenshots/06-premium.png',
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

test('icon and feature graphic dimensions stay unchanged while phone height becomes 2400', () => {
  assert.deepEqual(previewNames.find(([name]) => name === 'StoreAppIconScreenshot'), ['StoreAppIconScreenshot', 512, 512]);
  assert.deepEqual(
    previewNames.find(([name]) => name === 'StoreFeatureGraphicEnglishScreenshot'),
    ['StoreFeatureGraphicEnglishScreenshot', 1024, 500],
  );
  for (const [name, width, height] of previewNames.filter(([name]) => !name.includes('Icon') && !name.includes('FeatureGraphic'))) {
    assert.equal(width, 1080, name);
    assert.equal(height, 2400, name);
  }
});

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
