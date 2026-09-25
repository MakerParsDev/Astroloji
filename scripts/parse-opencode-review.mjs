import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function parseReviewEvents(input) {
  const texts = []

  for (const rawLine of String(input).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    let event
    try {
      event = JSON.parse(line)
    } catch {
      return {
        status: 'invalid',
        exitCode: 64,
        text: 'Review output was not valid OpenCode JSON event data.',
      }
    }

    if (event?.type !== 'text') continue
    const text = event?.part?.text
    if (typeof text === 'string' && text.trim()) texts.push(text.trim())
  }

  const text = texts.join('\n\n').trim()
  if (!text) {
    return {
      status: 'invalid',
      exitCode: 64,
      text: 'Review produced no assistant text.',
    }
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const markers = lines.filter((line) => /^REVIEW_RESULT: (?:PASS|BLOCK)$/.test(line))
  const final = lines.at(-1)

  if (markers.length !== 1 || !/^REVIEW_RESULT: (?:PASS|BLOCK)$/.test(final ?? '')) {
    return {
      status: 'invalid',
      exitCode: 64,
      text:
        text +
        '\n\nREVIEW_GATE_ERROR: final assistant line must be exactly REVIEW_RESULT: PASS or REVIEW_RESULT: BLOCK.',
    }
  }

  if (final === 'REVIEW_RESULT: BLOCK') {
    return { status: 'block', exitCode: 2, text }
  }
  return { status: 'pass', exitCode: 0, text }
}

async function readStdin() {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) input += chunk
  return input
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = parseReviewEvents(await readStdin())
  process.stdout.write(result.text + '\n')
  process.exitCode = result.exitCode
}
