import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelWorkflows = [
  'opencode-command.yml',
  'opencode-review.yml',
  'opencode-triage.yml',
  'opencode-maintenance.yml',
  'opencode-security-audit.yml',
  'opencode-dependencies.yml',
  'opencode-dispatch.yml',
]
const allWorkflows = [
  ...modelWorkflows,
  'opencode-pr-policy.yml',
  'opencode-ci-repair.yml',
  'opencode-model-canary.yml',
]
const pinnedAction = /^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40}(?:\s+#\s+.+)?$/

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8')
}

test('model workflows use only the checksum-pinned CLI and free selector', async () => {
  for (const name of modelWorkflows) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.match(body, /select-opencode-free-model\.mjs/, name)
    assert.match(body, /bash scripts\/install-opencode-ci\.sh/, name)
    assert.match(body, /bash scripts\/run-opencode-github-ci\.sh/, name)
    assert.match(body, /GITHUB_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/, name)
    assert.match(body, /MODEL:\s*\$\{\{ steps\.free_model\.outputs\.model \}\}/, name)
    assert.doesNotMatch(body, /anomalyco\/opencode\/github@/, name)
    assert.doesNotMatch(body, /releases\/latest|opencode\.ai\/install/, name)
    assert.doesNotMatch(body, /OPENCODE_API_KEY/, name)
    assert.doesNotMatch(body, /id-token:\s*write/, name)
  }
})

test('workflow roles are explicit runtime default-agent overlays', async () => {
  const expected = new Map([
    ['opencode-command.yml', 'maintainer'],
    ['opencode-review.yml', 'reviewer'],
    ['opencode-triage.yml', 'triage'],
    ['opencode-maintenance.yml', 'maintainer'],
    ['opencode-security-audit.yml', 'reviewer'],
    ['opencode-dependencies.yml', 'maintainer'],
    ['opencode-dispatch.yml', 'maintainer'],
  ])
  for (const [name, agent] of expected) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.ok(body.includes('OPENCODE_DEFAULT_AGENT: ' + agent), name)
  }
})

test('write-capable GitHub-agent workflows opt into ephemeral Git authentication', async () => {
  for (const name of [
    'opencode-command.yml',
    'opencode-maintenance.yml',
    'opencode-dependencies.yml',
    'opencode-dispatch.yml',
  ]) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.match(body, /OPENCODE_GIT_WRITE:\s*"true"/, name)
  }
  for (const name of ['opencode-review.yml', 'opencode-triage.yml', 'opencode-security-audit.yml']) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.doesNotMatch(body, /OPENCODE_GIT_WRITE:\s*"true"/, name)
  }
})

test('GitHub-agent runner overlays the requested agent and keeps Git credentials ephemeral', async () => {
  const body = await text('scripts/run-opencode-github-ci.sh')
  assert.match(body, /OPENCODE_CONFIG_CONTENT/)
  assert.match(body, /default_agent/)
  assert.match(body, /\$\{MODEL:\?MODEL is required\}/)
  assert.match(body, /export MODEL PROMPT/)
  assert.doesNotMatch(body, /unset\s+(?:MODEL|PROMPT)/)
  assert.match(body, /USE_GITHUB_TOKEN/)
  assert.match(body, /SHARE/)
  assert.match(body, /GIT_CONFIG_COUNT/)
  assert.match(body, /http\.https:\/\/github\.com\/\.extraheader/)
  assert.match(body, /x-access-token/)
  assert.match(body, /opencode github run/)
  assert.doesNotMatch(body, /git config|gh auth setup-git/)
})

test('every external action in every repository workflow is commit-SHA pinned', async () => {
  const names = (await readdir(path.join(root, '.github', 'workflows')))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  for (const name of names) {
    const body = await text(path.join('.github', 'workflows', name))
    const uses = [...body.matchAll(/^\s*-?\s*uses:\s*(.+)$/gm)].map((match) => match[1].trim())
    for (const value of uses) {
      if (value.startsWith('./')) continue
      assert.match(value, pinnedAction, `${name}: ${value}`)
    }
    assert.doesNotMatch(body, /uses:\s*[^\s]+@(?:latest|v\d+)\b/, name)
  }
})

test('autonomous policy control files are always high risk', async () => {
  const body = await text('config/autonomous-policy.json')
  const policy = JSON.parse(body)
  const compiled = policy.highRiskRules.map((rule) => new RegExp(rule.pattern, 'i'))
  for (const target of [
    'config/autonomous-policy.json',
    'scripts/autonomous-policy.mjs',
    'scripts/autonomous-policy.test.mjs',
    'scripts/check-autonomous-diff.mjs',
    'scripts/check-autonomous-diff.test.mjs',
  ]) {
    assert.ok(compiled.some((regex) => regex.test(target)), target)
  }
})

test('project config exposes only approved free coding models', async () => {
  const body = await text('opencode.jsonc')
  for (const model of [
    'muse-spark-1.3-contributor-free',
    'nemotron-3-ultra-free',
    'mimo-v2.6-flash-free',
    'nemotron-3.5-lightning-free',
    'ling-3.0-flash-fin-free',
    'mimo-v2.5-free',
    'big-pickle',
  ]) {
    assert.ok(body.includes('"' + model + '"'), model)
  }
  assert.doesNotMatch(body, /jev-1\.13-free/)
  assert.match(body, /"enabled_providers":\s*\["opencode"\]/)
  assert.match(body, /"share":\s*"disabled"/)
  assert.match(body, /"snapshot":\s*false/)
  assert.match(body, /"external_directory":\s*"deny"/)
  assert.match(body, /"bash":\s*\{[\s\S]*?"\*":\s*"deny"/)
  assert.doesNotMatch(body, /"git diff\*":\s*"allow"/)
  assert.match(body, /"git diff":\s*"allow"/)
  assert.match(body, /"git diff \*":\s*"allow"/)
  assert.match(body, /"git grep \*--no-index\*":\s*"deny"/)
  assert.match(body, /"git grep \*--untracked\*":\s*"deny"/)
  assert.match(body, /"git grep \*--no-exclude-standard\*":\s*"deny"/)
})

test('custom agents cannot override shell policy with blanket allow', async () => {
  const agents = await readdir(path.join(root, '.opencode', 'agents'))
  for (const name of agents) {
    const body = await text(path.join('.opencode', 'agents', name))
    assert.doesNotMatch(body, /^\s*bash:\s*allow\s*$/m, name)
  }
})

test('interactive command workflow accepts only trusted collaborators', async () => {
  const body = await text('.github/workflows/opencode-command.yml')
  for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.ok(body.includes(association), association)
  }
  assert.match(body, /author_association/)
})

test('automatic PR review is limited to same-repository PRs', async () => {
  const body = await text('.github/workflows/opencode-review.yml')
  assert.match(body, /head\.repo\.full_name == github\.repository/)
})

test('Mergify auto-merge is low-risk-only and every merge keeps external gates', async () => {
  const body = await text('.mergify.yml')
  assert.match(body, /auto_merge_conditions:[\s\S]*head ~= \^opencode\//)
  assert.match(body, /auto_merge_conditions:[\s\S]*label = risk:low/)
  assert.match(body, /auto_merge_conditions:[\s\S]*check-success = autonomous-risk-low/)
  assert.match(body, /auto_merge_conditions:[\s\S]*label != risk:high/)
  assert.match(body, /auto_merge_conditions:[\s\S]*label != needs-human/)
  assert.match(body, /success_conditions:[\s\S]*-head ~= \^opencode\//)
  assert.match(body, /success_conditions:[\s\S]*head ~= \^opencode\/[\s\S]*check-success = autonomous-risk-low/)
  assert.match(body, /success_conditions:[\s\S]*head ~= \^opencode\/[\s\S]*label = human-approved/)
  assert.match(body, /label != risk:high/)
  assert.match(body, /label != needs-human/)
  for (const check of [
    'secret-scan',
    'backend-verify',
    'android-verify',
    'review',
    'GitGuardian Security Checks',
    'SonarCloud Code Analysis',
    'semgrep-cloud-platform/scan',
  ]) {
    assert.ok(body.includes('check-success = ' + check), check)
  }
  assert.doesNotMatch(body, /check-success = CodeRabbit/)
})

test('automation can revoke but never grant the human-approved merge label', async () => {
  for (const name of allWorkflows) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.doesNotMatch(
      body,
      /addLabels[\s\S]{0,600}human-approved|labels:\s*\[[^\]]*human-approved/,
      name,
    )
    if (name !== 'opencode-pr-policy.yml') {
      assert.doesNotMatch(body, /human-approved/, name)
    }
  }
  const policy = await text('.github/workflows/opencode-pr-policy.yml')
  assert.match(policy, /context\.payload\.action === 'synchronize'/)
  assert.match(policy, /removeLabel[\s\S]{0,300}name:\s*'human-approved'/)

  for (const directory of ['agents', 'plugins', 'tools']) {
    for (const name of await readdir(path.join(root, '.opencode', directory))) {
      const body = await text(path.join('.opencode', directory, name))
      assert.doesNotMatch(body, /human-approved/, name)
    }
  }
})

test('PR policy imports the centralized classifier', async () => {
  const body = await text('.github/workflows/opencode-pr-policy.yml')
  assert.match(body, /scripts\/autonomous-policy\.mjs/)
  assert.match(body, /classifyAutonomousChange/)
  assert.doesNotMatch(body, /const sensitive = \[/)
})

test('PR policy is base-pinned, reasserts labels, and writes an exact-head low-risk status', async () => {
  const body = await text('.github/workflows/opencode-pr-policy.yml')
  assert.match(body, /pull_request_target:/)
  assert.doesNotMatch(body, /^\s*pull_request:\s*$/m)
  assert.match(body, /types:\s*\[opened, synchronize, reopened, labeled, unlabeled\]/)
  assert.match(body, /ref:\s*\$\{\{ github\.event\.pull_request\.base\.sha \}\}/)
  assert.doesNotMatch(body, /ref:\s*\$\{\{ github\.event\.pull_request\.head\.sha \}\}/)
  assert.match(body, /statuses:\s*write/)
  assert.match(body, /createCommitStatus/)
  assert.match(body, /sha:\s*context\.payload\.pull_request\.head\.sha/)
  assert.match(body, /context:\s*'autonomous-risk-low'/)
  assert.match(body, /state:\s*highRisk \? 'failure' : 'success'/)
  assert.match(body, /previous_filename/)
  assert.ok(body.indexOf('createCommitStatus') < body.indexOf('addLabels'))
})

test('Mergify is the only autonomous merge engine', async () => {
  await assert.rejects(
    text('.github/workflows/opencode-automerge.yml'),
    (error) => error?.code === 'ENOENT',
  )
  for (const name of allWorkflows) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.doesNotMatch(body, /github\.rest\.pulls\.merge|pulls\.merge\(/, name)
  }
})

test('CI self-healing is opt-in, same-repo, PR-scoped, full-diff-gated, and bounded', async () => {
  const body = await text('.github/workflows/opencode-ci-repair.yml')
  assert.match(body, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/)
  assert.match(body, /startsWith\('opencode\/'\)/)
  assert.match(body, /labels\.has\('opencode-autonomous'\)/)
  assert.match(body, /labels\.has\('risk:low'\)/)
  assert.match(body, /!labels\.has\('risk:high'\)/)
  assert.match(body, /!labels\.has\('needs-human'\)/)
  assert.match(body, /autonomous-risk-low/)
  assert.match(body, /riskStatus.*state === 'success'/s)
  assert.match(body, /base_sha/)
  assert.match(body, /pulls\/\$PR_NUMBER\/commits/)
  assert.match(body, /grep -c '\^ci: autonomous repair'/)
  assert.doesNotMatch(body, /git log -20/)
  assert.match(body, /-ge 2/)
  assert.match(body, /Block policy-control self-modification/)
  assert.match(body, /config\/autonomous-policy\.json/)
  assert.match(body, /scripts\/autonomous-policy/)
  assert.match(body, /scripts\/check-autonomous-diff/)
  assert.match(body, /sanitize-ci-log\.mjs/)
  assert.match(body, /git show "\$BASE_SHA:scripts\/check-autonomous-diff\.mjs"/)
  assert.match(body, /git show "\$BASE_SHA:scripts\/autonomous-policy\.mjs"/)
  assert.match(body, /git show "\$BASE_SHA:config\/autonomous-policy\.json"/)
  assert.match(body, /git diff --no-renames --numstat "\$BASE_SHA"/)
  assert.match(body, /node "\$policy_root\/scripts\/check-autonomous-diff\.mjs" --numstat/)
  assert.match(body, /bash scripts\/install-opencode-ci\.sh/)
  assert.doesNotMatch(body, /npm install --global opencode-ai/)
  assert.doesNotMatch(body, /OPENCODE_API_KEY/)
})

test('CI installer pins OpenCode release version and GitHub asset digest', async () => {
  const body = await text('scripts/install-opencode-ci.sh')
  assert.match(body, /OPENCODE_VERSION="1\.18\.32"/)
  assert.match(body, /OPENCODE_ASSET="opencode-linux-x64\.tar\.gz"/)
  assert.match(body, /OPENCODE_SHA256="3046e0404fdc60fb80307e7a47824ba07477364178a4d09baa8548496dd6d43b"/)
  assert.match(body, /sha256sum --check --strict/)
  assert.match(body, /github\.com\/anomalyco\/opencode\/releases\/download/)
})

test('model canary verifies the pinned CLI and GitHub env contract', async () => {
  const body = await text('.github/workflows/opencode-model-canary.yml')
  assert.match(body, /bash scripts\/install-opencode-ci\.sh/)
  assert.match(body, /node scripts\/probe-opencode-github-env\.mjs/)
  assert.doesNotMatch(body, /npm install --global opencode-ai/)
})

test('runtime safety guard covers secondary Git mutation and diff execution primitives', async () => {
  const body = await text('.opencode/plugins/safety-guard.ts')
  assert.ok(body.includes('stash|restore|apply'))
  assert.ok(body.includes('git\\s+branch'))
  assert.match(body, /--show-current/)
  assert.match(body, /difftool/)
  assert.match(body, /extcmd/)
  assert.match(body, /--ext-diff/)
  assert.match(body, /--textconv/)
  assert.match(body, /tool\.execute\.after/)
  assert.match(body, /blockedSensitivePath/)
  assert.match(body, /--no-index/)
  assert.match(body, /--untracked/)
})

test('OpenCode automation never embeds direct production mutation commands', async () => {
  for (const name of allWorkflows) {
    const body = await text(path.join('.github', 'workflows', name))
    assert.doesNotMatch(body, /^\s*run:\s*.*wrangler\s+deploy/im, name)
    assert.doesNotMatch(body, /publishReleaseBundle/i, name)
    assert.doesNotMatch(body, /promoteReleaseArtifact/i, name)
    assert.doesNotMatch(body, /^\s*run:\s*.*d1\s+.*--remote/im, name)
  }
})

test('OpenCode instruction assets are English, free-only, and LF-normalized', async () => {
  const files = [
    '.gitattributes',
    '.mergify.yml',
    'AGENTS.md',
    'opencode.jsonc',
    'docs/OPENCODE_AUTONOMY.md',
    'config/autonomous-policy.json',
    'scripts/autonomous-policy.mjs',
    'scripts/autonomous-policy.test.mjs',
    'scripts/check-autonomous-diff.mjs',
    'scripts/check-autonomous-diff.test.mjs',
    'scripts/install-opencode-ci.sh',
    'scripts/run-opencode-github-ci.sh',
    'scripts/run-opencode-github-ci.test.mjs',
    'scripts/probe-opencode-github-env.mjs',
    'scripts/safety-guard.test.mjs',
    'scripts/sanitize-ci-log.mjs',
    'scripts/sanitize-ci-log.test.mjs',
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
    assert.equal(body.includes('\r'), false, `${file} contains CR line endings`)
  }
})
