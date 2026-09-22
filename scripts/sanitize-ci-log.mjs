import process from 'node:process'

function sanitize(value) {
  return value
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|key|secret|signature)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b(?:ghp|github_pat|sk|ya29)_[A-Za-z0-9_\-]{16,}\b/g, '[REDACTED]')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED_PRIVATE_KEY]')
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  const lines = sanitize(input).split(/\r?\n/)
  const tail = lines.slice(-2500).join('\n')
  process.stdout.write(tail.slice(-250_000))
})
