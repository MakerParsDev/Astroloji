import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const policyPath = path.join(root, 'config', 'autonomous-policy.json')
export const AUTONOMOUS_POLICY = Object.freeze(
  JSON.parse(readFileSync(policyPath, 'utf8')),
)

function compileRules(rules) {
  return (rules ?? []).map((rule) => ({
    ...rule,
    regex: new RegExp(rule.pattern, 'i'),
  }))
}

const compiledRules = compileRules(AUTONOMOUS_POLICY.highRiskRules)
const compiledConstitutionalRules = compileRules(AUTONOMOUS_POLICY.constitutionalRules)

export function normalizeRepositoryPath(value) {
  return String(value).trim().replaceAll('\\', '/').replace(/^\.\//, '')
}

function matchingReasons(files, rules) {
  const reasons = []
  for (const file of files) {
    for (const rule of rules) {
      if (rule.regex.test(file)) reasons.push(`${file}: ${rule.name}`)
    }
  }
  return reasons
}

export function classifyAutonomousChange({ paths, totalChanges }) {
  const normalized = paths.map(normalizeRepositoryPath).filter(Boolean)
  const sensitiveReasons = matchingReasons(normalized, compiledRules)
  const constitutionalReasons = matchingReasons(normalized, compiledConstitutionalRules)
  const reasons = [...sensitiveReasons]

  const hasKnownChangedLines =
    totalChanges !== undefined &&
    totalChanges !== null &&
    totalChanges !== '' &&
    Number.isFinite(Number(totalChanges))
  const changedLines = hasKnownChangedLines ? Number(totalChanges) : null

  let sizeBlocked = false
  if (normalized.length > AUTONOMOUS_POLICY.maxFiles) {
    reasons.push(`changed file count ${normalized.length} exceeds ${AUTONOMOUS_POLICY.maxFiles}`)
    sizeBlocked = true
  }
  if (!hasKnownChangedLines) {
    reasons.push('changed line count is unknown')
    sizeBlocked = true
  } else if (changedLines > AUTONOMOUS_POLICY.maxChangedLines) {
    reasons.push(`changed line count ${changedLines} exceeds ${AUTONOMOUS_POLICY.maxChangedLines}`)
    sizeBlocked = true
  }

  const tier =
    constitutionalReasons.length > 0 || sizeBlocked
      ? 'blocked'
      : sensitiveReasons.length > 0
        ? 'elevated'
        : 'low'

  return {
    risk: tier === 'low' ? 'low' : 'high',
    tier,
    files: normalized.length,
    changedLines,
    reasons: [...new Set(reasons)],
    constitutionalReasons: [...new Set(constitutionalReasons)],
  }
}
