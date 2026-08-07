import { cliArgument as argument } from './lib/cli-arguments.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImageInfo, sha256 } from './lib/play-assets.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultScenesPath = path.join(
  repositoryRoot,
  'Astroloji/play/assets/source/store-scenes.json',
);

function listPngFiles(rootDir) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) visit(resolved);
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) files.push(resolved);
    }
  };
  visit(rootDir);
  return files.sort();
}

function expectedDimensions(role) {
  if (role === 'icon') return { width: 512, height: 512 };
  if (role === 'featureGraphic') return { width: 1024, height: 500 };
  if (role === 'phoneScreenshot') return { width: 1080, height: 1920 };
  throw new Error(`Unsupported Play asset role: ${role}`);
}

function loadScenes(scenesPath) {
  const parsed = JSON.parse(fs.readFileSync(scenesPath, 'utf8'));
  if (parsed.version !== 1 || !Array.isArray(parsed.scenes)) {
    throw new Error('Store scenes file must contain version 1 and a scenes array.');
  }
  return parsed.scenes;
}

function findGolden(files, preview) {
  const matches = files.filter((filePath) => path.basename(filePath).includes(preview));
  if (matches.length === 0) throw new Error(`Missing golden preview: ${preview}`);
  if (matches.length > 1) throw new Error(`Ambiguous golden preview: ${preview}`);
  return matches[0];
}

export function exportPlayAssets({
  sourceRoot,
  outputRoot,
  scenesPath = defaultScenesPath,
}) {
  const scenes = loadScenes(scenesPath);
  const sourceFiles = listPngFiles(sourceRoot);

  for (const topLevel of ['shared', 'en-US', 'tr-TR']) {
    fs.rmSync(path.join(outputRoot, topLevel), { recursive: true, force: true });
  }
  fs.mkdirSync(outputRoot, { recursive: true });

  const assets = scenes.map((scene) => {
    const sourcePath = findGolden(sourceFiles, scene.preview);
    const info = readImageInfo(sourcePath);
    const expected = expectedDimensions(scene.role);
    if (info.format !== 'png') {
      throw new Error(`${scene.preview} must be PNG, got ${info.format}`);
    }
    if (info.width !== expected.width || info.height !== expected.height) {
      throw new Error(
        `${scene.preview} must be ${expected.width}x${expected.height}, got ${info.width}x${info.height}`,
      );
    }

    const destination = path.join(outputRoot, scene.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(sourcePath, destination);

    return {
      locale: scene.locale,
      role: scene.role,
      order: scene.order,
      path: scene.path,
      format: info.format,
      width: info.width,
      height: info.height,
      sha256: sha256(destination),
    };
  });

  const manifestPath = path.resolve(outputRoot, '..', 'asset-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ version: 1, assets }, null, 2)}\n`);
  return assets;
}


const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const sourceRoot = argument('source-root');
  const outputRoot = argument('output-root');
  const scenesPath = argument('scenes') ?? defaultScenesPath;
  if (!sourceRoot || !outputRoot) {
    console.error('Usage: node scripts/export-play-assets.mjs --source-root=<path> --output-root=<path>');
    process.exit(1);
  }
  try {
    const assets = exportPlayAssets({
      sourceRoot: path.resolve(sourceRoot),
      outputRoot: path.resolve(outputRoot),
      scenesPath: path.resolve(scenesPath),
    });
    console.log(`Exported ${assets.length} Play assets.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
