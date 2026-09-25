import test from 'node:test'
import assert from 'node:assert/strict'
import { AstrolojiSafetyGuard } from '../.opencode/plugins/safety-guard.ts'

async function hooks() {
  return AstrolojiSafetyGuard({
    client: {
      app: {
        log: async () => {},
      },
    },
  })
}

test('direct reads and grep targets cannot access secret-bearing paths', async () => {
  const guard = await hooks()
  const before = guard['tool.execute.before']
  assert.equal(typeof before, 'function')

  for (const [tool, args] of [
    ['read', { filePath: '.env' }],
    ['read', { filePath: 'auth.json' }],
    ['edit', { filePath: '.env' }],
    ['write', { filePath: 'backend/.dev.vars' }],
    ['apply_patch', { path: 'Astroloji/app/google-services.json' }],
    ['grep', { pattern: 'secret', path: '.env' }],
    ['grep', { pattern: 'secret', include: '*service-account*' }],
  ]) {
    await assert.rejects(
      before({ tool, sessionID: 's', callID: 'c' }, { args }),
      /secret-bearing|trust boundary/i,
      tool + ':' + JSON.stringify(args),
    )
  }

  await assert.doesNotReject(
    before(
      { tool: 'read', sessionID: 's', callID: 'c' },
      { args: { filePath: 'Astroloji/app/google-services.example.json' } },
    ),
  )
  await assert.doesNotReject(
    before(
      { tool: 'read', sessionID: 's', callID: 'c' },
      { args: { filePath: 'scripts/retire-google-service-account-key.mjs' } },
    ),
  )
})

test('grep results are redacted before a sensitive path reaches the model', async () => {
  const guard = await hooks()
  const after = guard['tool.execute.after']
  assert.equal(typeof after, 'function')

  const output = {
    title: 'secret',
    output: [
      'Found 1 matches',
      'C:/repo/backend/.dev.vars:',
      '  Line 1: API_TOKEN=should-never-reach-model',
    ].join('\n'),
    metadata: { matches: 1, truncated: false },
  }

  await after(
    {
      tool: 'grep',
      sessionID: 's',
      callID: 'c',
      args: { pattern: 'API_TOKEN', path: 'backend' },
    },
    output,
  )

  assert.equal(output.output.includes('should-never-reach-model'), false)
  assert.match(output.output, /Blocked: grep matched a secret-bearing path/i)
  assert.equal(output.metadata.blockedSensitivePath, true)
})

test('ordinary grep output remains available', async () => {
  const guard = await hooks()
  const after = guard['tool.execute.after']
  const output = {
    title: 'HomeScreen',
    output: [
      'Found 1 matches',
      'C:/repo/Astroloji/app/src/main/java/example/HomeScreen.kt:',
      '  Line 1: class HomeScreen',
    ].join('\n'),
    metadata: { matches: 1, truncated: false },
  }

  await after(
    {
      tool: 'grep',
      sessionID: 's',
      callID: 'c',
      args: { pattern: 'HomeScreen', path: 'Astroloji/app/src/main' },
    },
    output,
  )

  assert.match(output.output, /class HomeScreen/)
})

test('shell git grep cannot escape the tracked-file boundary', async () => {
  const guard = await hooks()
  const before = guard['tool.execute.before']

  for (const command of [
    'git grep --no-index token .',
    'git grep --untracked token',
  ]) {
    await assert.rejects(
      before(
        { tool: 'bash', sessionID: 's', callID: 'c' },
        { args: { command } },
      ),
      /reserved for guarded workflows/i,
      command,
    )
  }

  await assert.doesNotReject(
    before(
      { tool: 'bash', sessionID: 's', callID: 'c' },
      { args: { command: 'git grep HomeScreen -- Astroloji/app/src/main' } },
    ),
  )
})

test('agent shell environment strips GitHub and process-local Git credentials', async () => {
  const guard = await hooks()
  const shellEnv = guard['shell.env']
  assert.equal(typeof shellEnv, 'function')

  const output = {
    env: {
      GITHUB_TOKEN: 'secret-token',
      GH_TOKEN: 'secret-gh-token',
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic secret',
      SAFE_VALUE: 'kept',
    },
  }

  await shellEnv({ cwd: '/repo' }, output)

  assert.equal(output.env.GITHUB_TOKEN, '')
  assert.equal(output.env.GH_TOKEN, '')
  assert.equal(output.env.GIT_CONFIG_COUNT, '0')
  assert.equal(output.env.GIT_CONFIG_KEY_0, '')
  assert.equal(output.env.GIT_CONFIG_VALUE_0, '')
  assert.equal(output.env.SAFE_VALUE, 'kept')
})
