import process from 'node:process'
import { classifyAutonomousChange } from './autonomous-policy.mjs'

export function parseNumstat(input) {
  const paths = []
  let totalChanges = 0
  for (const line of String(input).split(/\r?\n/)) {
    if (!line.trim()) continue
    const [added, deleted, ...pathParts] = line.split('\t')
    const file = pathParts.join('\t')
    if (!file) continue
    paths.push(file)
    if (added !== '-') totalChanges += Number.parseInt(added, 10) || 0
    if (deleted !== '-') totalChanges += Number.parseInt(deleted, 10) || 0
  }
  return { paths, totalChanges }
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let value = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { value += chunk })
    process.stdin.on('end', () => resolve(value))
    process.stdin.on('error', reject)
  })
}

export async function main() {
  const input = String(await readStdin())
  const change = process.argv.includes('--numstat')
    ? parseNumstat(input)
    : { paths: input.split(/\r?\n/) }
  const result = classifyAutonomousChange(change)
  console.log(JSON.stringify(result))
  if (result.risk !== 'low') process.exitCode = 2
}

if (import.meta.url === new URL(`file://${process.argv[1]?.replaceAll('\\', '/')}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
