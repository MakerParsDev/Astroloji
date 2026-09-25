import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const policyPath = path.join(root, 'config', 'autonomous-policy.json')
export const AUTONOMOUS_POLICY = Object.freeze(
  JSON.parse(readFileSync(policyPath, 'utf8')),
)

const compiledRules = AUTONOMOUS_POLICY.highRiskRules.map((rule) => ({
  ...rule,
  regex: new RegExp(rule.pattern, 'i'),
}))

export function normalizeRepositoryPath(value) {
  return String(value).trim().replaceAll('\\', '/').replace(/^\.\//, '')
}

export function classifyAutonomousChange({ paths, totalChanges }) {
  const normalized = paths.map(normalizeRepositoryPath).filter(Boolean)
  const reasons = []
  for (const file of normalized) {
    for (const rule of compiledRules) {
      if (rule.regex.test(file)) reasons.push(`${file}: ${rule.name}`)
    }
  }

  const hasKnownChangedLines =
    totalChanges !== undefined &&
    totalChanges !== null &&
    totalChanges !== '' &&
    Number.isFinite(Number(totalChanges))
  const changedLines = hasKnownChangedLines ? Number(totalChanges) : null

  if (normalized.length > AUTONOMOUS_POLICY.maxFiles) {
    reasons.push(`changed file count ${normalized.length} exceeds ${AUTONOMOUS_POLICY.maxFiles}`)
  }
  if (!hasKnownChangedLines) {
    reasons.push('changed line count is unknown')
  } else if (changedLines > AUTONOMOUS_POLICY.maxChangedLines) {
    reasons.push(`changed line count ${changedLines} exceeds ${AUTONOMOUS_POLICY.maxChangedLines}`)
  }

  return {
    risk: reasons.length ? 'high' : 'low',
    files: normalized.length,
    changedLines,
    reasons: [...new Set(reasons)],
  }
}
