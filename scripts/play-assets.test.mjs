import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  readImageInfo,
  sha256,
  validateAssetManifest,
  validateChecksum,
} from './lib/play-assets.mjs';

function png(width, height, uniqueByte = 0) {
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

function writeAsset(root, relativePath, width, height, uniqueByte) {
  const filePath = path.join(root, 'Astroloji/play/assets', relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png(width, height, uniqueByte));
  return {
    path: relativePath,
    format: 'png',
    width,
    height,
    sha256: sha256(filePath),
  };
}

function validFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-assets-'));
  const assets = [];
  assets.push({
    locale: 'shared',
    role: 'icon',
    order: 0,
    ...writeAsset(root, 'shared/icon/icon.png', 512, 512, 1),
  });

  let uniqueByte = 2;
  for (const locale of ['en-US', 'tr-TR']) {
    assets.push({
      locale,
      role: 'featureGraphic',
      order: 0,
      ...writeAsset(root, `${locale}/featureGraphic/feature-graphic.png`, 1024, 500, uniqueByte++),
    });
    for (let order = 1; order <= 6; order += 1) {
      const slug = ['daily', 'weekly', 'monthly', 'compatibility', 'profile', 'premium'][order - 1];
      assets.push({
        locale,
        role: 'phoneScreenshot',
        order,
        ...writeAsset(root, `${locale}/phoneScreenshots/0${order}-${slug}.png`, 1080, 2400, uniqueByte++),
      });
    }
  }

  const manifestPath = path.join(root, 'Astroloji/play/asset-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, assets }, null, 2));
  return { root, assets, manifestPath };
}

const config = {
  locales: ['en-US', 'tr-TR'],
  assets: {
    phoneScreenshotCount: 6,
    featureGraphic: { width: 1024, height: 500 },
    icon: { width: 512, height: 512 },
  },
};

test('asset contract keeps icon and feature graphic dimensions unchanged', () => {
  assert.deepEqual(config.assets.icon, { width: 512, height: 512 });
  assert.deepEqual(config.assets.featureGraphic, { width: 1024, height: 500 });
});

test('reads PNG dimensions and validates checksum', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-image-'));
  const iconPath = path.join(root, 'icon.png');
  const featurePath = path.join(root, 'feature.png');
  fs.writeFileSync(iconPath, png(512, 512, 1));
  fs.writeFileSync(featurePath, png(1024, 500, 2));
  assert.deepEqual(readImageInfo(iconPath), { format: 'png', width: 512, height: 512 });
  assert.deepEqual(readImageInfo(featurePath), { format: 'png', width: 1024, height: 500 });
  assert.doesNotThrow(() => validateChecksum(iconPath, sha256(iconPath)));
  fs.appendFileSync(iconPath, Buffer.from([9]));
  assert.throws(() => validateChecksum(iconPath, sha256(featurePath)), /checksum mismatch/i);
});

test('valid localized manifest has six screenshots per locale', () => {
  const fixture = validFixture();
  assert.deepEqual(validateAssetManifest(fixture.root, config), []);
});

test('manifest rejects path escape and wrong screenshot count', () => {
  const fixture = validFixture();
  const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
  manifest.assets = manifest.assets.filter(
    (asset) => !(asset.locale === 'tr-TR' && asset.role === 'phoneScreenshot' && asset.order === 6),
  );
  manifest.assets[0].path = '../outside.png';
  fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
  const errors = validateAssetManifest(fixture.root, config);
  assert.ok(errors.some((error) => /escapes asset root/i.test(error)));
  assert.ok(errors.some((error) => /tr-TR phoneScreenshots count/i.test(error)));
});

test('manifest rejects duplicate screenshot checksums across locales', () => {
  const fixture = validFixture();
  const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
  const en = manifest.assets.find((asset) => asset.locale === 'en-US' && asset.role === 'phoneScreenshot');
  const tr = manifest.assets.find((asset) => asset.locale === 'tr-TR' && asset.role === 'phoneScreenshot');
  tr.sha256 = en.sha256;
  fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
  const errors = validateAssetManifest(fixture.root, config);
  assert.ok(errors.some((error) => /cross-locale screenshot checksum/i.test(error)));
});

test('unsupported image format is rejected', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-image-'));
  const filePath = path.join(root, 'asset.gif');
  fs.writeFileSync(filePath, Buffer.from('GIF89a'));
  assert.throws(() => readImageInfo(filePath), /unsupported image format/i);
});

test('main metadata validator enforces the localized asset manifest', () => {
  const validator = fs.readFileSync('scripts/validate-play-metadata.mjs', 'utf8');
  assert.match(validator, /validateAssetManifest/);
  assert.match(validator, /for \(const error of validateAssetManifest\(repositoryRoot, storeConfig\)\)/);
});

test('manifest rejects unsupported locales and illegal shared/localized roles', () => {
  const fixture = validFixture();
  const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
  const foreign = writeAsset(fixture.root, 'fr-FR/featureGraphic/feature-graphic.png', 1024, 500, 222);
  manifest.assets.push({ locale: 'fr-FR', role: 'featureGraphic', order: 0, ...foreign });
  const sharedFeature = writeAsset(fixture.root, 'shared/featureGraphic/feature-graphic.png', 1024, 500, 223);
  manifest.assets.push({ locale: 'shared', role: 'featureGraphic', order: 0, ...sharedFeature });
  const localizedIcon = writeAsset(fixture.root, 'en-US/icon/icon.png', 512, 512, 224);
  manifest.assets.push({ locale: 'en-US', role: 'icon', order: 0, ...localizedIcon });
  fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
  const errors = validateAssetManifest(fixture.root, config);
  assert.ok(errors.some((error) => /unsupported asset locale.*fr-FR/i.test(error)));
  assert.ok(errors.some((error) => /shared.*only.*icon/i.test(error)));
  assert.ok(errors.some((error) => /en-US.*role.*icon/i.test(error)));
});
