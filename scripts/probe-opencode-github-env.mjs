import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const OPENCODE_VERSION = '1.18.32'
const OPENCODE_COMMIT = '545f51d26cc39a907d2867492d498d9607ea5fa4'
const HANDLER_SHA256 = '724687d1e7ed0ad0f1c197499192c163fd5fb94a973be488bd0792728533d11b'
const HANDLER_URL =
  'https://raw.githubusercontent.com/anomalyco/opencode/' +
  OPENCODE_COMMIT +
  '/packages/opencode/src/cli/cmd/github.handler.ts'

function executable() {
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
}

function verifyBinaryVersion() {
  const result = spawnSync(executable(), ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error('Unable to read the installed OpenCode version.\n' + String(result.stderr ?? ''))
  }
  const version = String(result.stdout ?? '').trim()
  if (version !== OPENCODE_VERSION) {
    throw new Error(`Expected OpenCode ${OPENCODE_VERSION}, got ${version || '<empty>'}.`)
  }
}

async function fetchPinnedHandler() {
  const response = await fetch(HANDLER_URL, {
    headers: { 'user-agent': 'astroloji-opencode-contract-probe' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    throw new Error(`Unable to fetch pinned OpenCode handler source: HTTP ${response.status}`)
  }
  return response.text()
}

function verifyHandlerSource(source) {
  const digest = createHash('sha256').update(source, 'utf8').digest('hex')
  if (digest !== HANDLER_SHA256) {
    throw new Error(`Pinned OpenCode handler digest mismatch: ${digest}`)
  }

  for (const contract of [
    'const value = process.env["MODEL"]',
    'const customPrompt = process.env["PROMPT"]',
    'const { providerID, modelID } = normalizeModel()',
    'const { userPrompt, promptFiles } = await getUserPrompt()',
  ]) {
    if (!source.includes(contract)) {
      throw new Error(`Pinned OpenCode GitHub env contract missing: ${contract}`)
    }
  }
}

verifyBinaryVersion()
verifyHandlerSource(await fetchPinnedHandler())
console.log('Pinned OpenCode github MODEL/PROMPT source contract passed.')
