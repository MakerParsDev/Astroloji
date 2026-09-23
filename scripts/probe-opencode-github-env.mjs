import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const command = (() => {
  if (process.platform !== 'win32') return 'opencode'
  const candidate = path.join(
    process.env.APPDATA ?? '',
    'npm',
    'node_modules',
    'opencode-ai',
    'bin',
    'opencode.exe',
  )
  if (!existsSync(candidate)) {
    throw new Error('Unable to resolve the installed OpenCode executable on Windows.')
  }
  return candidate
})()
const event = JSON.stringify({
  eventName: 'schedule',
  repo: { owner: 'MakerParsDev', repo: 'Astroloji' },
  payload: {},
})

function run(extraEnv, { omitPrompt = false } = {}) {
  const env = {
    ...process.env,
    GITHUB_RUN_ID: '1',
    GITHUB_TOKEN: 'probe-token',
    USE_GITHUB_TOKEN: 'true',
    SHARE: 'false',
    ...extraEnv,
  }
  if (omitPrompt) delete env.PROMPT

  const result = spawnSync(
    command,
    ['github', 'run', '--event', event, '--token', 'probe-token'],
    {
      env,
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    },
  )
  if (result.error) throw result.error
  return {
    status: result.status,
    output: String(result.stdout ?? '') + String(result.stderr ?? ''),
  }
}

const modelProbe = run({
  MODEL: '/',
  PROMPT: 'probe-prompt',
})
if (modelProbe.status === 0 || !/Invalid model .*format "provider\/model"/i.test(modelProbe.output)) {
  throw new Error(
    'Pinned OpenCode github runner did not prove MODEL env consumption.\n' +
      modelProbe.output.slice(-4000),
  )
}

const promptProbe = run(
  {
    MODEL: 'opencode/big-pickle',
  },
  { omitPrompt: true },
)
if (promptProbe.status === 0 || !/PROMPT input is required/i.test(promptProbe.output)) {
  throw new Error(
    'Pinned OpenCode github runner did not prove PROMPT env consumption.\n' +
      promptProbe.output.slice(-4000),
  )
}

console.log('Pinned OpenCode github MODEL/PROMPT env contract passed.')
