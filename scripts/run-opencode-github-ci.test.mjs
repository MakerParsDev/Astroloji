import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runner = path.join(root, 'scripts', 'run-opencode-github-ci.sh')

function runFixture(f, extraEnv) {
  const env = { ...f.env, ...extraEnv }
  if (process.platform === 'win32') {
    const names = ['GITHUB_TOKEN', 'MODEL', 'PROMPT', 'OPENCODE_DEFAULT_AGENT', 'OPENCODE_GIT_WRITE']
    env.WSLENV = [env.WSLENV, ...names].filter(Boolean).join(':')
  }
  return spawnSync('bash', ['-c', 'export PATH="$PWD/bin:$PATH"; exec ./runner.sh'], {
    cwd: f.dir,
    env,
    encoding: 'utf8',
  })
}

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-github-runner-'))
  const bin = path.join(dir, 'bin')
  await mkdir(bin)
  const fake = path.join(bin, 'opencode')
  const runnerCopy = path.join(dir, 'runner.sh')
  await copyFile(runner, runnerCopy)
  await chmod(runnerCopy, 0o755)
  const fakeBody = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'if [[ "$*" != "github run" ]]; then',
    '  echo "unexpected args: $*" >&2',
    '  exit 70',
    'fi',
    "printf 'CONFIG=%s\\n' \"${OPENCODE_CONFIG_CONTENT-}\"",
    "printf 'MODEL=%s\\n' \"${MODEL-}\"",
    "printf 'PROMPT=%s\\n' \"${PROMPT-}\"",
    "printf 'SHARE=%s\\n' \"${SHARE-}\"",
    "printf 'USE_GITHUB_TOKEN=%s\\n' \"${USE_GITHUB_TOKEN-}\"",
    "printf 'COUNT=%s\\n' \"${GIT_CONFIG_COUNT-unset}\"",
    'if [[ "${GIT_CONFIG_COUNT-unset}" != "unset" ]]; then',
    "  printf 'NAME=%s\\n' \"$(git config --get user.name)\"",
    "  printf 'EMAIL=%s\\n' \"$(git config --get user.email)\"",
    "  printf 'HEADER=%s\\n' \"$(git config --get http.https://github.com/.extraheader)\"",
    'fi',
    '',
  ].join('\n')
  await writeFile(fake, fakeBody, 'utf8')
  await chmod(fake, 0o755)

  const init = spawnSync('git', ['init', '--quiet'], { cwd: dir, encoding: 'utf8' })
  assert.equal(init.status, 0, init.stderr)

  const configPath = path.join(dir, '.git', 'config')
  const before = await readFile(configPath, 'utf8')
  const env = {
    ...process.env,
    GITHUB_TOKEN: 'runner-test-token',
    MODEL: 'opencode/big-pickle',
    PROMPT: 'runner-test-prompt',
  }
  for (const key of Object.keys(env)) {
    if (key === 'GIT_CONFIG_COUNT' || key.startsWith('GIT_CONFIG_KEY_') || key.startsWith('GIT_CONFIG_VALUE_')) {
      delete env[key]
    }
  }

  return { dir, configPath, before, env }
}

test('write mode exposes Git auth only through child-process config', async () => {
  const f = await fixture()
  try {
    const result = runFixture(f, {
      OPENCODE_DEFAULT_AGENT: 'maintainer',
      OPENCODE_GIT_WRITE: 'true',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /CONFIG=\{"default_agent":"maintainer"\}/)
    assert.match(result.stdout, /MODEL=opencode\/big-pickle/)
    assert.match(result.stdout, /PROMPT=runner-test-prompt/)
    assert.match(result.stdout, /SHARE=false/)
    assert.match(result.stdout, /USE_GITHUB_TOKEN=true/)
    assert.match(result.stdout, /COUNT=3/)
    assert.match(result.stdout, /NAME=opencode-agent\[bot\]/)
    assert.match(result.stdout, /EMAIL=opencode-agent\[bot\]@users\.noreply\.github\.com/)
    const encoded = Buffer.from('x-access-token:runner-test-token', 'utf8').toString('base64')
    assert.ok(result.stdout.includes('HEADER=AUTHORIZATION: basic ' + encoded))
    assert.equal(await readFile(f.configPath, 'utf8'), f.before)
  } finally {
    await rm(f.dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})

test('read-only mode injects agent overlay without Git write credentials', async () => {
  const f = await fixture()
  try {
    const result = runFixture(f, {
      OPENCODE_DEFAULT_AGENT: 'reviewer',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /CONFIG=\{"default_agent":"reviewer"\}/)
    assert.match(result.stdout, /MODEL=opencode\/big-pickle/)
    assert.match(result.stdout, /PROMPT=runner-test-prompt/)
    assert.match(result.stdout, /COUNT=unset/)
    assert.equal(await readFile(f.configPath, 'utf8'), f.before)
  } finally {
    await rm(f.dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})

test('runner rejects unsafe agent names before executing OpenCode', async () => {
  const f = await fixture()
  try {
    const result = runFixture(f, {
      OPENCODE_DEFAULT_AGENT: 'reviewer";touch pwned',
    })
    assert.equal(result.status, 64)
    assert.match(result.stderr, /Invalid OPENCODE_DEFAULT_AGENT/)
  } finally {
    await rm(f.dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
  }
})
