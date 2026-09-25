import process from 'node:process'

function isAsciiLetter(char) {
  const code = char.charCodeAt(0)
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isAsciiDigit(char) {
  const code = char.charCodeAt(0)
  return code >= 48 && code <= 57
}

function isEmailLocalChar(char) {
  return isAsciiLetter(char) || isAsciiDigit(char) || '._%+-'.includes(char)
}

function isUnicodeLetter(char) {
  return /^\p{L}$/u.test(char)
}

function isEmailDomainChar(char) {
  return isUnicodeLetter(char) || isAsciiDigit(char) || '.-'.includes(char)
}

export function redactEmailLikeIdentifiers(value) {
  const text = String(value)
  const ranges = []

  for (let at = 0; at < text.length; at++) {
    if (text[at] !== '@') continue

    let start = at
    while (start > 0 && at - start < 64 && isEmailLocalChar(text[start - 1])) start--

    let end = at + 1
    let domainLength = 0
    while (end < text.length && domainLength < 255) {
      const char = String.fromCodePoint(text.codePointAt(end))
      if (!isEmailDomainChar(char)) break
      end += char.length
      domainLength++
    }
    while (end > at + 1 && '.-'.includes(text[end - 1])) end--

    if (start === at || end === at + 1) continue

    const domain = text.slice(at + 1, end)
    const lastDot = domain.lastIndexOf('.')
    if (lastDot <= 0) continue

    const suffix = domain.slice(lastDot + 1)
    const suffixLength = [...suffix].length
    if (
      suffixLength < 2 ||
      suffixLength > 63 ||
      [...suffix].some((char) => !isUnicodeLetter(char))
    ) {
      continue
    }

    ranges.push([start, end])
    at = end - 1
  }

  if (ranges.length === 0) return text

  let output = ''
  let cursor = 0
  for (const [start, end] of ranges) {
    output += text.slice(cursor, start)
    output += '[REDACTED_EMAIL]'
    cursor = end
  }
  output += text.slice(cursor)
  return output
}

export function sanitizeCiLog(value) {
  const sanitized = String(value)
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED_PRIVATE_KEY]')
    .replace(/(authorization:\s*(?:bearer|basic)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_\-]{16,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bgithub_pat_[A-Za-z0-9_\-]{16,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_\-]{16,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bya29\.[A-Za-z0-9_\-]+\b/g, '[REDACTED_GOOGLE_TOKEN]')
    .replace(/\bdp\.(?:st|sa)\.[A-Za-z0-9._\-]+\b/gi, '[REDACTED_DOPPLER_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/\bAIza[A-Za-z0-9_\-]{20,}\b/g, '[REDACTED_GOOGLE_API_KEY]')
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]')
    .replace(
      /\b(OPENCODE_API_KEY|GITHUB_TOKEN|GH_TOKEN|DOPPLER_TOKEN|CLOUDFLARE_API_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|PLAY_SERVICE_ACCOUNT_JSON)\s*[:=]\s*[^\s]+/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /\b(token|auth[_-]?token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /([?&](?:token|auth[_-]?token|key|secret|signature|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)=)[^&\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /(["'](?:token|auth[_-]?token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)["']\s*:\s*["'])[^"']+(["'])/gi,
      '$1[REDACTED]$2',
    )

  return redactEmailLikeIdentifiers(sanitized)
}

export function boundedSanitizedTail(value, { maxLines = 1200, maxChars = 120_000 } = {}) {
  const lines = sanitizeCiLog(value).split(/\r?\n/)
  return lines.slice(-maxLines).join('\n').slice(-maxChars)
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { input += chunk })
    process.stdin.on('end', () => resolve(input))
    process.stdin.on('error', reject)
  })
}

export async function main() {
  process.stdout.write(boundedSanitizedTail(await readStdin()))
}

if (import.meta.url === new URL(`file://${process.argv[1]?.replaceAll('\\', '/')}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
