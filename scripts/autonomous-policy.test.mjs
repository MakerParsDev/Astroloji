import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyAutonomousChange } from './autonomous-policy.mjs'

test('ordinary implementation paths remain low risk', () => {
  const result = classifyAutonomousChange({
    paths: ['Astroloji/app/src/main/java/com/parsfilo/astrology/ui/HomeScreen.kt'],
    totalChanges: 120,
  })
  assert.equal(result.risk, 'low')
})

test('documentation containing release words does not false-positive', () => {
  const result = classifyAutonomousChange({
    paths: ['docs/release-notes.md'],
    totalChanges: 20,
  })
  assert.equal(result.risk, 'low')
})

test('autonomous control-plane files are always high risk', () => {
  for (const file of [
    'AGENTS.md',
    'opencode.jsonc',
    'renovate.json',
    'config/autonomous-policy.json',
    '.opencode/agents/maintainer.md',
    '.opencode/skills/release-safety/SKILL.md',
    'scripts/autonomous-policy.mjs',
    'scripts/check-autonomous-diff.mjs',
    'scripts/probe-opencode-github-env.mjs',
    'scripts/parse-opencode-review.mjs',
    'scripts/parse-opencode-review.test.mjs',
    'scripts/safety-guard.test.mjs',
    'scripts/select-opencode-free-model.mjs',
    'scripts/sanitize-ci-log.mjs',
    'scripts/install-opencode-ci.sh',
    'scripts/run-opencode-github-ci.sh',
    'scripts/scan-secrets.mjs',
  ]) {
    assert.equal(
      classifyAutonomousChange({ paths: [file], totalChanges: 1 }).risk,
      'high',
      file,
    )
  }
})

test('root CI script tests are always high risk', () => {
  for (const file of [
    'scripts/opencode-workflow-contract.test.mjs',
    'scripts/ci-workflow-contract.test.mjs',
    'scripts/backend-admin-capability-workflow.test.mjs',
    'scripts/android-quality-gates.test.mjs',
    'scripts/sanitize-ci-log.test.mjs',
  ]) {
    assert.equal(classifyAutonomousChange({ paths: [file], totalChanges: 1 }).risk, 'high', file)
  }
})

test('security, deployment, and store mutation paths are high risk', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    '.mergify.yml',
    'backend/src/middleware/auth.ts',
    'backend/migrations/0007.sql',
    'backend/wrangler.toml',
    'Astroloji/play/store-config.json',
  ]) {
    assert.equal(classifyAutonomousChange({ paths: [file], totalChanges: 1 }).risk, 'high', file)
  }
})

test('size thresholds are shared and fail closed', () => {
  assert.equal(
    classifyAutonomousChange({
      paths: Array.from({ length: 21 }, (_, i) => `docs/${i}.md`),
      totalChanges: 100,
    }).risk,
    'high',
  )
  assert.equal(
    classifyAutonomousChange({ paths: ['docs/a.md'], totalChanges: 1001 }).risk,
    'high',
  )
})

test('unknown changed-line count fails closed', () => {
  const result = classifyAutonomousChange({ paths: ['docs/a.md'] })
  assert.equal(result.risk, 'high')
  assert.equal(result.changedLines, null)
  assert.match(result.reasons.join('\n'), /changed line count is unknown/)
})
