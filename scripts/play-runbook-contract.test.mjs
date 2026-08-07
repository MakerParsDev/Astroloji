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
  assert.match(runbook, /GetTempPath/);
  assert.match(runbook, /finally\s*\{[\s\S]*Remove-Item -Force \$credentialPath/);
});

test('runbook documents exact run-scoped expiring workflow authorization', () => {
  assert.match(runbook, /METADATA_PUBLISH_AUTH_RUN_ID/);
  assert.match(runbook, /METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH/);
  assert.match(runbook, /METADATA_PUBLISH_AUTH_CORRELATION/);
  assert.match(runbook, /authorization_correlation/i);
  assert.match(runbook, /exactly one/i);
  assert.match(runbook, /head SHA/i);
  assert.match(runbook, /(?:exact[^\n]*workflow run ID|workflow run ID[^\n]*exact)/i);
  assert.match(runbook, /(?:300 seconds|5 minutes)/i);
  assert.match(runbook, /METADATA_PUBLISH_AUTH_RUN_ID=disabled/);
  assert.match(runbook, /METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH=0/);
  assert.match(runbook, /ENABLE_METADATA_PUBLISH=false/);
  assert.match(runbook, /METADATA_PUBLISH_AUTH_CORRELATION=disabled/);
  assert.match(runbook, /local rc=0|rc=0/);
  assert.match(runbook, /return "?\$rc"?/);
  assert.match(runbook, /if close_metadata_authorization; then[\s\S]*trap - EXIT INT TERM/);
  const codeBlocks = [...runbook.matchAll(/```(?:bash|powershell)\n([\s\S]*?)```/gi)].map((match) => match[1]);
  const directMutationBlocks = codeBlocks.filter((block) => /publish-play-metadata|--backup-sha256|RESTORE_PLAY_METADATA/.test(block));
  assert.ok(directMutationBlocks.length >= 3);
  assert.ok(directMutationBlocks.every((block) => !/ENABLE_METADATA_PUBLISH\s*=\s*(?:true|'true'|"true")/i.test(block)));
});

test('runbook keeps read-only backup, diff, live verification, and read-back ungated', () => {
  const codeBlocks = [...runbook.matchAll(/```(?:bash|powershell)\n([\s\S]*?)```/gi)].map((match) => match[1]);
  for (const command of ['backup-play-metadata.mjs', 'diff-play-metadata.mjs', 'verify-play-backup-current.mjs', 'readback-play-metadata.mjs']) {
    const blocks = codeBlocks.filter((block) => block.includes(command));
    assert.ok(blocks.length >= 1, `Missing read-only runbook command ${command}`);
    assert.ok(blocks.every((block) => !/METADATA_PUBLISH_AUTH_RUN_ID|METADATA_PUBLISH_AUTH_EXPIRES_AT_EPOCH|METADATA_PUBLISH_AUTH_CORRELATION/.test(block)), `${command} must remain ungated.`);
  }
});
