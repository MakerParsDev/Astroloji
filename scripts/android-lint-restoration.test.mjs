import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function text(relative) {
  return readFile(path.join(root, relative), 'utf8')
}

test('friends share effect keeps a stable collector across resource updates', async () => {
  const body = await text(
    'Astroloji/app/src/main/java/com/parsfilo/astrology/feature/friends/FriendsScreen.kt',
  )
  assert.match(body, /rememberUpdatedState/)
  assert.match(body, /LaunchedEffect\(viewModel\)/)
  assert.doesNotMatch(body, /LaunchedEffect\(viewModel,\s*resources/)
  assert.match(body, /currentResources\.getString/)
  assert.match(body, /Intent\.createChooser\(intent, currentShareChooserTitle\)/)
})

test('Spanish locale exposes Portuguese in the language picker', async () => {
  const body = await text('Astroloji/app/src/main/res/values-es/strings.xml')
  assert.match(body, /<string name="language_name_portuguese">Portugués<\/string>/)
})
