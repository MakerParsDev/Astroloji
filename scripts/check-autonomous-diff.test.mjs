import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyAutonomousDiff } from './check-autonomous-diff.mjs'

test('allows ordinary implementation and test paths', () => {
  const result = classifyAutonomousDiff([
    'Astroloji/app/src/main/java/com/parsfilo/astrology/ui/HomeScreen.kt',
    'Astroloji/app/src/test/java/com/parsfilo/astrology/ui/HomeScreenTest.kt',
  ])
  assert.equal(result.risk, 'low')
})

test('blocks production and security-sensitive paths', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    'backend/src/auth/adminAuth.ts',
    'backend/migrations/0007.sql',
    'Astroloji/app/src/main/AndroidManifest.xml',
    'Astroloji/play/listings/en-US/title.txt',
  ]) {
    assert.equal(classifyAutonomousDiff([file]).risk, 'high', file)
  }
})
