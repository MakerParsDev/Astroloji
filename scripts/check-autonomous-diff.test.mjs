import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNumstat } from './check-autonomous-diff.mjs'
import { classifyAutonomousChange } from './autonomous-policy.mjs'

test('allows ordinary implementation and test paths', () => {
  const result = classifyAutonomousChange({
    paths: [
      'Astroloji/app/src/main/java/com/parsfilo/astrology/ui/HomeScreen.kt',
      'Astroloji/app/src/test/java/com/parsfilo/astrology/ui/HomeScreenTest.kt',
    ],
    totalChanges: 180,
  })
  assert.equal(result.risk, 'low')
})

test('blocks production and security-sensitive paths', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    'backend/src/middleware/auth.ts',
    'backend/migrations/0007.sql',
    'Astroloji/app/src/main/AndroidManifest.xml',
    'Astroloji/play/listings/en-US/title.txt',
  ]) {
    assert.equal(classifyAutonomousChange({ paths: [file] }).risk, 'high', file)
  }
})

test('numstat parser carries changed-line size into the shared policy', () => {
  const change = parseNumstat('600\t401\tAstroloji/app/src/main/java/example/Foo.kt\n')
  assert.equal(change.totalChanges, 1001)
  assert.equal(classifyAutonomousChange(change).risk, 'high')
})
