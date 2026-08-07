import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function metadataFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'play-metadata-validator-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.cpSync('scripts/validate-play-metadata.mjs', path.join(root, 'scripts/validate-play-metadata.mjs'));
  fs.cpSync('scripts/lib', path.join(root, 'scripts/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Astroloji'), { recursive: true });
  fs.cpSync('Astroloji/play', path.join(root, 'Astroloji/play'), { recursive: true });
  const localeTarget = path.join(root, 'Astroloji/app/src/main/res/xml');
  fs.mkdirSync(localeTarget, { recursive: true });
  fs.cpSync('Astroloji/app/src/main/res/xml/locales_config.xml', path.join(localeTarget, 'locales_config.xml'));
  return root;
}

test('metadata validator fails when canonical release-notes root is absent', () => {
  const root = metadataFixture();
  fs.rmSync(path.join(root, 'Astroloji/play/release-notes'), { recursive: true, force: true });
  const result = spawnSync(process.execPath, ['scripts/validate-play-metadata.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Missing release-note directory/i);
});
