import process from 'node:process'

export const SENSITIVE_MARKERS = [
  '.github/',
  'release_runbook.md',
  'backend/migrations/',
  'backend/wrangler',
  'androidmanifest.xml',
  'gradle.properties',
  'google-services',
  'service-account',
  'keystore',
  'auth',
  'admin',
  'subscription',
  'billing',
  'rtdn',
  'ssv',
  'rate-limit',
  'secret',
  'deploy',
  'release',
  '/play/',
]

export function classifyAutonomousDiff(paths) {
  const normalized = paths
    .map((value) => value.trim().replaceAll('\\', '/').toLowerCase())
    .filter(Boolean)
  const reasons = []
  for (const file of normalized) {
    const marker = SENSITIVE_MARKERS.find((value) => file.includes(value))
    if (marker) reasons.push(`${file} matched ${marker}`)
  }
  if (normalized.length > 20) reasons.push(`changed file count ${normalized.length} exceeds 20`)
  return {
    risk: reasons.length ? 'high' : 'low',
    files: normalized.length,
    reasons,
  }
}

async function main() {
  const input = await new Promise((resolve, reject) => {
    let value = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { value += chunk })
    process.stdin.on('end', () => resolve(value))
    process.stdin.on('error', reject)
  })
  const result = classifyAutonomousDiff(String(input).split(/\r?\n/))
  console.log(JSON.stringify(result))
  if (result.risk !== 'low') process.exitCode = 2
}

if (import.meta.url === new URL(`file://${process.argv[1]?.replaceAll('\\', '/')}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
