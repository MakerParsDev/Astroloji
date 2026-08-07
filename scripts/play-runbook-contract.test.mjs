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
  const mutationBlocks = [...runbook.matchAll(/```powershell\n([\s\S]*?)```/gi)]
    .map((match) => match[1])
    .filter((block) => /publish-play-metadata|--backup-sha256|RESTORE_PLAY_METADATA/.test(block));
  assert.ok(mutationBlocks.some((block) => /try\s*\{[\s\S]*publish-play-metadata[\s\S]*\}\s*finally\s*\{[\s\S]*Remove-Item Env:ENABLE_METADATA_PUBLISH -ErrorAction SilentlyContinue/.test(block)));
  assert.ok(mutationBlocks.some((block) => /try\s*\{[\s\S]*cleanup-play-locales[\s\S]*--backup-sha256[\s\S]*\}\s*finally\s*\{[\s\S]*Remove-Item Env:ENABLE_METADATA_PUBLISH -ErrorAction SilentlyContinue/.test(block)));
  assert.ok(mutationBlocks.some((block) => /try\s*\{[\s\S]*restore-play-metadata[\s\S]*RESTORE_PLAY_METADATA[\s\S]*\}\s*finally\s*\{[\s\S]*Remove-Item Env:ENABLE_METADATA_PUBLISH -ErrorAction SilentlyContinue/.test(block)));
});

test('runbook keeps read-only backup, diff, live verification, and read-back ungated', () => {
  const codeBlocks = [...runbook.matchAll(/```(?:bash|powershell)\n([\s\S]*?)```/gi)].map((match) => match[1]);
  for (const command of ['backup-play-metadata.mjs', 'diff-play-metadata.mjs', 'verify-play-backup-current.mjs', 'readback-play-metadata.mjs']) {
    const blocks = codeBlocks.filter((block) => block.includes(command));
    assert.ok(blocks.length >= 1, `Missing read-only runbook command ${command}`);
    assert.ok(blocks.every((block) => !/ENABLE_METADATA_PUBLISH/.test(block)), `${command} must remain ungated.`);
  }
});
