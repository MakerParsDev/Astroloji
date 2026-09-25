import { appendFile } from 'node:fs/promises'

export const FREE_CODING_MODEL_PRIORITY = [
  'muse-spark-1.3-contributor-free',
  'nemotron-3-ultra-free',
  'mimo-v2.6-flash-free',
  'nemotron-3.5-lightning-free',
  'ling-3.0-flash-fin-free',
  'mimo-v2.5-free',
  'big-pickle',
]

export function selectFreeModel(availableIds) {
  const available = new Set(availableIds)
  const id = FREE_CODING_MODEL_PRIORITY.find((candidate) => available.has(candidate))
  if (!id) {
    throw new Error('No approved OpenCode Zen free coding model is currently available.')
  }
  return `opencode/${id}`
}

export async function fetchAvailableModelIds(fetchImpl = fetch) {
  const response = await fetchImpl('https://opencode.ai/zen/v1/models', {
    headers: { 'user-agent': 'MakerParsDev-Astroloji-free-model-selector/1.0' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Zen model catalog request failed: HTTP ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload?.data)) throw new Error('Unexpected Zen model catalog response.')
  return payload.data.map((entry) => entry?.id).filter((id) => typeof id === 'string')
}

export async function main() {
  const model = selectFreeModel(await fetchAvailableModelIds())
  console.log(`Selected free OpenCode coding model: ${model}`)
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `model=${model}\n`, 'utf8')
  }
  return model
}

if (import.meta.url === new URL(`file://${process.argv[1]?.replaceAll('\\', '/')}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
