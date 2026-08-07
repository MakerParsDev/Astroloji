import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runbook = fs.readFileSync('docs/PLAY_STORE_OPTIMIZATION_RUNBOOK.md', 'utf8');

test('runbook provides Ubuntu Bash and Windows PowerShell operator equivalents', () => {
  assert.match(runbook, /```bash/);
  assert.match(runbook, /```powershell/i);
  assert.match(runbook, /\$env:PLAY_PACKAGE_NAME/);
  assert.match(runbook, /\$env:PLAY_SERVICE_ACCOUNT_JSON_PATH/);
  assert.match(runbook, /Get-FileHash/);
});

test('runbook gates only mutation apply commands with ENABLE_METADATA_PUBLISH', () => {
  for (const script of ['publish-play-metadata.mjs', 'cleanup-play-locales.mjs', 'restore-play-metadata.mjs']) {
    assert.match(runbook, new RegExp(script.replaceAll('.', '\\.')));
  }
  assert.match(runbook, /ENABLE_METADATA_PUBLISH=true[\s\S]{0,250}publish-play-metadata\.mjs/);
  assert.match(runbook, /ENABLE_METADATA_PUBLISH=true[\s\S]{0,400}cleanup-play-locales\.mjs[\s\S]{0,300}--confirmation/);
  assert.match(runbook, /ENABLE_METADATA_PUBLISH=true[\s\S]{0,300}restore-play-metadata\.mjs[\s\S]{0,250}--confirmation/);
  assert.match(runbook, /\$env:ENABLE_METADATA_PUBLISH\s*=\s*['"]true['"]/i);
});
