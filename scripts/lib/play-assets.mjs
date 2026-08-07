import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function validateChecksum(filePath, expected) {
  const actual = sha256(filePath);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${filePath}: expected ${expected}, got ${actual}`);
  }
}

function readJpegInfo(buffer, filePath) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error(`Unsupported image format: ${filePath}`);
  }

  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) break;
      return {
        format: 'jpeg',
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }

  throw new Error(`Malformed JPEG image: ${filePath}`);
}

export function readImageInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
      throw new Error(`Malformed PNG image: ${filePath}`);
    }
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  return readJpegInfo(buffer, filePath);
}

function ensureAssetPath(assetRoot, relativePath) {
  const resolvedRoot = path.resolve(assetRoot);
  const resolved = path.resolve(assetRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes asset root: ${relativePath}`);
  }
  return resolved;
}

function expectedDimensions(asset, config) {
  if (asset.role === 'icon') return config.assets.icon;
  if (asset.role === 'featureGraphic') return config.assets.featureGraphic;
  if (asset.role === 'phoneScreenshot') return { width: 1080, height: 1920 };
  return null;
}

export function validateAssetManifest(rootDir, config) {
  const errors = [];
  const manifestPath = path.join(rootDir, 'Astroloji/play/asset-manifest.json');
  const assetRoot = path.join(rootDir, 'Astroloji/play/assets');

  if (!fs.existsSync(manifestPath)) return [`Missing asset manifest: ${manifestPath}`];

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [`Invalid asset manifest JSON: ${error instanceof Error ? error.message : String(error)}`];
  }

  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    return ['Asset manifest must contain version 1 and an assets array'];
  }

  const seenPaths = new Set();
  const checksumByLocale = new Map();
  const screenshotChecksumLocales = new Map();

  for (const asset of manifest.assets) {
    const label = `${asset.locale ?? 'unknown'}:${asset.role ?? 'unknown'}:${asset.order ?? 'unknown'}`;
    const allowedLocales = new Set(['shared', ...config.locales]);
    if (!allowedLocales.has(asset.locale)) {
      errors.push(`Unsupported asset locale: ${String(asset.locale)}`);
    }
    if (asset.locale === 'shared' && asset.role !== 'icon') {
      errors.push(`shared assets may only use the icon role: ${String(asset.role)}`);
    }
    if (config.locales.includes(asset.locale) && !['featureGraphic', 'phoneScreenshot'].includes(asset.role)) {
      errors.push(`${asset.locale} has unsupported localized asset role: ${String(asset.role)}`);
    }
    if (!asset.path || typeof asset.path !== 'string') {
      errors.push(`${label} is missing path`);
      continue;
    }
    if (seenPaths.has(asset.path)) errors.push(`Duplicate asset filename/path: ${asset.path}`);
    seenPaths.add(asset.path);

    let filePath;
    try {
      filePath = ensureAssetPath(assetRoot, asset.path);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    if (!fs.existsSync(filePath)) {
      errors.push(`Missing asset file: ${asset.path}`);
      continue;
    }

    let info;
    try {
      info = readImageInfo(filePath);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    if (asset.format !== info.format || asset.width !== info.width || asset.height !== info.height) {
      errors.push(`${asset.path} manifest image metadata does not match file`);
    }

    const dimensions = expectedDimensions(asset, config);
    if (!dimensions) {
      errors.push(`${asset.path} has unsupported role: ${asset.role}`);
    } else if (info.width !== dimensions.width || info.height !== dimensions.height) {
      errors.push(
        `${asset.path} must be ${dimensions.width}x${dimensions.height}, got ${info.width}x${info.height}`,
      );
    }

    if (!/^[0-9a-f]{64}$/.test(asset.sha256 ?? '')) {
      errors.push(`${asset.path} has invalid sha256`);
      continue;
    }

    const actualChecksum = sha256(filePath);
    if (actualChecksum !== asset.sha256) {
      errors.push(`Checksum mismatch for ${asset.path}`);
    }

    const localeChecksums = checksumByLocale.get(asset.locale) ?? new Set();
    if (localeChecksums.has(asset.sha256)) {
      errors.push(`Duplicate checksum within locale ${asset.locale}: ${asset.path}`);
    }
    localeChecksums.add(asset.sha256);
    checksumByLocale.set(asset.locale, localeChecksums);

    if (asset.role === 'phoneScreenshot') {
      const locales = screenshotChecksumLocales.get(asset.sha256) ?? new Set();
      locales.add(asset.locale);
      screenshotChecksumLocales.set(asset.sha256, locales);
    }
  }

  const icons = manifest.assets.filter((asset) => asset.locale === 'shared' && asset.role === 'icon');
  if (icons.length !== 1) errors.push(`shared icon count must be 1, got ${icons.length}`);

  for (const locale of config.locales) {
    const features = manifest.assets.filter(
      (asset) => asset.locale === locale && asset.role === 'featureGraphic',
    );
    if (features.length !== 1) {
      errors.push(`${locale} featureGraphic count must be 1, got ${features.length}`);
    }

    const screenshots = manifest.assets.filter(
      (asset) => asset.locale === locale && asset.role === 'phoneScreenshot',
    );
    if (screenshots.length !== config.assets.phoneScreenshotCount) {
      errors.push(
        `${locale} phoneScreenshots count must be ${config.assets.phoneScreenshotCount}, got ${screenshots.length}`,
      );
    }
    const orders = screenshots.map((asset) => asset.order).sort((a, b) => a - b);
    const expectedOrders = Array.from(
      { length: config.assets.phoneScreenshotCount },
      (_, index) => index + 1,
    );
    if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) {
      errors.push(`${locale} phoneScreenshots orders must be 1-${config.assets.phoneScreenshotCount}`);
    }
  }

  for (const [checksum, locales] of screenshotChecksumLocales) {
    if (locales.size > 1) {
      errors.push(
        `Cross-locale screenshot checksum ${checksum} is reused by ${[...locales].sort().join(', ')}`,
      );
    }
  }

  return errors;
}
