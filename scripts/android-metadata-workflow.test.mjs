import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/android-metadata.yml', import.meta.url);
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('metadata publisher passes an expanded runner temp credential path', () => {
  assert.match(
    workflow,
    /PLAY_SERVICE_ACCOUNT_JSON_PATH:\s*['"]?\$\{\{\s*runner\.temp\s*\}\}\/play-service-account\.json['"]?/,
  );
  assert.doesNotMatch(
    workflow,
    /PLAY_SERVICE_ACCOUNT_JSON_PATH:\s*['"]?\$RUNNER_TEMP\/play-service-account\.json['"]?/,
  );
});

const publisherPath = new URL('./publish-play-metadata.mjs', import.meta.url);
const publisher = fs.readFileSync(publisherPath, 'utf8');

test('metadata commits default to Play automatic review submission', () => {
  assert.doesNotMatch(
    workflow,
    /PLAY_CHANGES_NOT_SENT_FOR_REVIEW:\s*['"]?true['"]?/,
  );
  assert.match(
    publisher,
    /PLAY_CHANGES_NOT_SENT_FOR_REVIEW\?\.toLowerCase\(\)\s*===\s*['"]true['"]/,
  );
});
