import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const actionWorkflows = [
  'opencode-command.yml',
  'opencode-review.yml',
  'opencode-triage.yml',
  'opencode-maintenance.yml',
  'opencode-security-audit.yml',
  'opencode-dependencies.yml',
  'opencode-dispatch.yml',
]
const allWorkflows = [
  ...actionWorkflows,
  'opencode-pr-policy.yml',
  'opencode-automerge.yml',
  'opencode-ci-repair.yml',
  'opencode-model-canary.yml',
]

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8')
}

test('OpenCode action workflows select approved free models and disable sharing', async () => {
  for (const name of actionWorkflows) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.match(body, /select-opencode-free-model\.mjs/, name)
    assert.match(body, /OPENCODE_API_KEY:/, name)
    assert.match(body, /share:\s*false/, name)
    assert.match(body, /persist-credentials:\s*false/, name)
  }
})
test('project config exposes only the OpenCode provider and approved free models', async () => {
  const body = await text('opencode.jsonc')
  assert.match(body, /"enabled_providers":\s*\["opencode"\]/)
  assert.match(body, /"whitelist":/)
  for (const model of [
    'muse-spark-1.3-contributor-free',
    'nemotron-3-ultra-free',
    'mimo-v2.6-flash-free',
    'nemotron-3.5-lightning-free',
    'ling-3.0-flash-fin-free',
    'mimo-v2.5-free',
    'jev-1.13-free',
    'big-pickle',
  ]) {
    assert.ok(body.includes('"' + model + '"'), model)
  }
  assert.match(body, /"share":\s*"disabled"/)
  assert.match(body, /"snapshot":\s*false/)
  assert.match(body, /"subagent_depth":\s*2/)
  assert.match(body, /"lsp":\s*true/)
  assert.match(body, /"git push\*":\s*"deny"/)
})

test('interactive command workflow accepts only trusted collaborators', async () => {
  const body = await text('.github/workflows/opencode-command.yml')
  assert.match(body, /author_association/)
  assert.match(body, /OWNER/)
  assert.match(body, /MEMBER/)
  assert.match(body, /COLLABORATOR/)
})

test('automatic PR review is limited to same-repository PRs', async () => {
  const body = await text('.github/workflows/opencode-review.yml')
  assert.match(body, /head\.repo\.full_name == github\.repository/)
})
test('autonomous merge requires exact low-risk policy and external gates', async () => {
  const body = await text('.github/workflows/opencode-automerge.yml')
  assert.match(body, /startsWith\('opencode\/'\)/)
  assert.match(body, /risk:low/)
  assert.match(body, /risk:high/)
  assert.match(body, /needs-human/)
  for (const check of [
    'secret-scan',
    'backend-verify',
    'android-verify',
    'CodeRabbit',
    'GitGuardian Security Checks',
    'SonarCloud Code Analysis',
    'semgrep-cloud-platform/scan',
  ]) {
    assert.ok(body.includes(check), check)
  }
  assert.match(body, /sha:\s*pr\.head\.sha/)
  assert.match(body, /hasUnresolvedThreads/)
})

test('CI self-healing is bounded and risk-gated', async () => {
  const body = await text('.github/workflows/opencode-ci-repair.yml')
  assert.match(body, /grep -c '\^ci: autonomous repair'/)
  assert.match(body, /-ge 2/)
  assert.match(body, /sanitize-ci-log\.mjs/)
  assert.match(body, /check-autonomous-diff\.mjs/)
  assert.match(body, /git push origin "HEAD:\$BRANCH"/)
})

test('OpenCode automation never embeds direct production mutation commands', async () => {
  for (const name of allWorkflows) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.doesNotMatch(body, /wrangler\s+deploy/i, name)
    assert.doesNotMatch(body, /publishReleaseBundle/i, name)
    assert.doesNotMatch(body, /promoteReleaseArtifact/i, name)
    assert.doesNotMatch(body, /d1\s+.*--remote/i, name)
  }
})
test('read-only agents cannot edit repository files', async () => {
  for (const agent of ['reviewer.md', 'triage.md', 'security-reviewer.md', 'docs-researcher.md']) {
    const body = await text(path.join('.opencode', 'agents', agent))
    assert.match(body, /edit:\s*deny/, agent)
  }
})

test('OpenCode assets contain no Turkish prompt text or forbidden model wording', async () => {
  const files = [
    'AGENTS.md',
    'opencode.jsonc',
    'docs/OPENCODE_AUTONOMY.md',
    'scripts/select-opencode-free-model.mjs',
    'scripts/select-opencode-free-model.test.mjs',
    ...allWorkflows.map((name) => path.join('.github', 'workflows', name)),
  ]
  for (const directory of ['agents', 'plugins', 'tools']) {
    for (const name of await readdir(path.join(root, '.opencode', directory))) {
      files.push(path.join('.opencode', directory, name))
    }
  }
  for (const name of await readdir(path.join(root, '.opencode', 'skills'), { recursive: true })) {
    if (name.endsWith('SKILL.md')) files.push(path.join('.opencode', 'skills', name))
  }
  const turkishChars = new RegExp([
    '\\u00e7', '\\u011f', '\\u0131', '\\u00f6', '\\u015f', '\\u00fc',
    '\\u00c7', '\\u011e', '\\u0130', '\\u00d6', '\\u015e', '\\u00dc',
  ].join('|'), 'u')
  const forbiddenModelWord = new RegExp(['p', 'a', 'i', 'd'].join(''), 'i')
  for (const file of files) {
    const body = await text(file)
    assert.doesNotMatch(body, turkishChars, file)
    assert.doesNotMatch(body, forbiddenModelWord, file)
    assert.equal(body.includes('\r'), false, file + ' contains CR line endings')
  }
})
