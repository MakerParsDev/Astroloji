import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const retiredBots = [
  'opencode-maintenance.yml',
  'opencode-dependencies.yml',
  'opencode-security-audit.yml',
  'opencode-triage.yml',
  'opencode-command.yml',
  'opencode-dispatch.yml',
  'opencode-ci-repair.yml',
  'opencode-model-canary.yml',
  'opencode-pr-policy.yml',
];

const requiredChecks = [
  'secret-scan', 'backend-verify', 'android-verify', 'review',
  'GitGuardian Security Checks', 'SonarCloud Code Analysis',
  'semgrep-cloud-platform/scan',
];

test('autonomous AI maintenance bots and competing updater are retired', async () => {
  const files = await readdir(path.join(root, '.github/workflows'));
  for (const name of retiredBots) assert.ok(!files.includes(name), name);
  await assert.rejects(read('renovate.json'), { code: 'ENOENT' });
  assert.ok(files.includes('opencode-review.yml'), 'independent review stays active');
});

test('review keeps an exact-head, base-trusted gate rather than mutating the PR', async () => {
  const body = await read('.github/workflows/opencode-review.yml');
  for (const snippet of [
    'workflow_run:', 'workflows: [ci]', 'types: [completed]',
    'listPullRequestsAssociatedWithCommit', 'item.head.sha === sha',
    'git fetch --no-tags --no-recurse-submodules origin "$HEAD_SHA"',
    'Do not checkout, switch, reset, or execute code from the pull request head',
    'opencode run --auto --agent reviewer', 'REVIEW_RESULT: PASS',
    'REVIEW_RESULT: BLOCK', '-f context=review',
    'select-opencode-free-model.mjs', 'bash scripts/install-opencode-ci.sh',
  ]) assert.ok(body.includes(snippet), snippet);
  const reviewerStep = body.match(/- name: Independent OpenCode review gate[\s\S]*?(?=\n\s{6}- name:|$)/)?.[0] ?? '';
  assert.doesNotMatch(reviewerStep, /GH_TOKEN|GITHUB_TOKEN/);
  assert.doesNotMatch(body, /run-opencode-github-ci\.sh/);
});

test('GitHub Actions remain pinned to commit SHAs', async () => {
  const names = (await readdir(path.join(root, '.github/workflows')))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
  const pinned = /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40}(?:\s+#\s+.+)?$/;
  for (const name of names) {
    const body = await read(`.github/workflows/${name}`);
    const refs = [...body.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map((match) => match[1].trim());
    for (const ref of refs) if (!ref.startsWith('./')) assert.match(ref, pinned, `${name}: ${ref}`);
  }
});

test('Dependabot is the only automated updater, grouped and concurrency-limited', async () => {
  const config = await read('.github/dependabot.yml');
  assert.match(config, /^version: 2$/m);
  assert.match(config, /package-ecosystem: npm[\s\S]*directory: \/backend/);
  assert.match(config, /package-ecosystem: gradle[\s\S]*directory: \/Astroloji/);
  assert.match(config, /package-ecosystem: github-actions[\s\S]*directory: \//);
  assert.equal((config.match(/open-pull-requests-limit: 1/g) ?? []).length, 3);
  assert.equal((config.match(/update-types: \[minor, patch\]/g) ?? []).length, 5);
  assert.equal((config.match(/update-types: \[version-update:semver-major\]/g) ?? []).length, 3);
  assert.equal((config.match(/applies-to: security-updates/g) ?? []).length, 2);
  assert.match(config, /Europe\/Istanbul/);
});

test('Mergify auto-merges only safe Dependabot PRs and requires every quality check', async () => {
  const text = await read('.mergify.yml');
  const [settings, protections] = text.split(/^merge_protections:/m);
  assert.match(settings, /author = dependabot\[bot\]/);
  assert.match(settings, /-label = major/);
  assert.match(settings, /-label = needs-human/);
  assert.match(settings, /-label = risk:blocked/);
  for (const excluded of ['^\\.github/', '^Astroloji/gradle/', '^backend/migrations/', '^backend/src/']) {
    assert.ok(settings.includes(`- -files ~= ${excluded}`), excluded);
  }
  assert.doesNotMatch(settings, /author = renovate|head ~= \^opencode\//);
  assert.match(protections, /base = main/);
  assert.match(protections, /#review-threads-unresolved = 0/);
  assert.match(settings, /max_parallel_checks: 1/);
  assert.match(settings, /mode: serial/);
  assert.match(settings, /batch_size: 1/);
  assert.match(settings, /max_checks_retries: 0/);
  const queue = settings.match(/queue_conditions:[\s\S]*?(?=\nmerge_protections_settings:)/)?.[0] ?? '';
  assert.ok(queue, 'queue conditions must be present');
  assert.doesNotMatch(settings, /^\s+merge_conditions:/m);
  for (const check of requiredChecks) assert.ok(queue.includes(`check-success = ${check}`), `queue ${check}`);
  assert.match(queue, /#review-threads-unresolved = 0/);
  assert.match(queue, /#approved-reviews-by >= 1/);
  assert.match(protections, /#approved-reviews-by >= 1/);
  for (const check of requiredChecks) assert.ok(protections.includes(`check-success = ${check}`), check);
  assert.doesNotMatch(text, /check-success = CodeRabbit/);
});

test('independent reviewer remains SHA-pinned and permits no direct production writes', async () => {
  const body = await read('.github/workflows/opencode-review.yml');
  assert.doesNotMatch(body, /wrangler\s+(?:deploy|d1 migrations apply)/);
  assert.doesNotMatch(body, /github\.rest\.pulls\.merge|pulls\.merge\(/);
  const installer = await read('scripts/install-opencode-ci.sh');
  assert.match(installer, /OPENCODE_VERSION="1\.18\.32"/);
  assert.match(installer, /sha256sum --check --strict/);
});
