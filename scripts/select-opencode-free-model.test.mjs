import test from 'node:test'
import assert from 'node:assert/strict'
import { FREE_CODING_MODEL_PRIORITY, selectFreeModel } from './select-opencode-free-model.mjs'

test('selects the highest-priority approved free coding model', () => {
  const model = selectFreeModel([
    'nemotron-3-ultra-free',
    'muse-spark-1.3-contributor-free',
    'unlisted-model',
  ])
  assert.equal(model, 'opencode/muse-spark-1.3-contributor-free')
})

test('falls through to another approved free coding model', () => {
  const model = selectFreeModel(['mimo-v2.6-flash-free'])
  assert.equal(model, 'opencode/mimo-v2.6-flash-free')
})

test('stops when no approved free coding model is available', () => {
  assert.throws(
    () => selectFreeModel(['jev-1.13-free', 'unknown-model']),
    /No approved OpenCode Zen free coding model is currently available/,
  )
})

test('coding allowlist excludes the System One decision model', () => {
  assert.equal(FREE_CODING_MODEL_PRIORITY.includes('jev-1.13-free'), false)
  assert.deepEqual(FREE_CODING_MODEL_PRIORITY, [
    'muse-spark-1.3-contributor-free',
    'nemotron-3-ultra-free',
    'mimo-v2.6-flash-free',
    'nemotron-3.5-lightning-free',
    'ling-3.0-flash-fin-free',
    'mimo-v2.5-free',
    'big-pickle',
  ])
})
