import test from 'node:test'
import assert from 'node:assert/strict'
import { FREE_MODEL_PRIORITY, selectFreeModel } from './select-opencode-free-model.mjs'
test('selects the highest-priority approved free model', () => {
  const model = selectFreeModel([
    'nemotron-3-ultra-free',
    'muse-spark-1.3-contributor-free',
    'unlisted-model',
  ])
  assert.equal(model, 'opencode/muse-spark-1.3-contributor-free')
})
test('falls through to another approved free model', () => {
  const model = selectFreeModel(['mimo-v2.6-flash-free'])
  assert.equal(model, 'opencode/mimo-v2.6-flash-free')
})
test('stops when no approved free model is available', () => {
  assert.throws(
    () => selectFreeModel(['unknown-model-a', 'unknown-model-b']),
    /No approved OpenCode Zen free model is currently available/,
  )
})
test('priority list contains only the approved free allowlist', () => {
  assert.deepEqual(FREE_MODEL_PRIORITY, [
    'muse-spark-1.3-contributor-free',
    'nemotron-3-ultra-free',
    'mimo-v2.6-flash-free',
    'nemotron-3.5-lightning-free',
    'ling-3.0-flash-fin-free',
    'mimo-v2.5-free',
    'jev-1.13-free',
    'big-pickle',
  ])
})
