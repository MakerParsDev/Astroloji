import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedSanitizedTail, sanitizeCiLog } from './sanitize-ci-log.mjs'

test('redacts common CI credential formats and identifiers', () => {
  const input = [
    'Authorization: Bearer super-secret',
    'Authorization: Basic dXNlcjpwYXNz',
    'authToken=camel-auth-secret',
    '{"auth-token":"quoted-auth-secret"}',
    'GITHUB_TOKEN=ghs_1234567890abcdefghijklmnop',
    'OPENCODE_API_KEY: secret-value',
    'doppler=dp.st.abcdefghijklmnopqrstuvwxyz',
    'jwt=eyJabcdefghijk.abcdefghijk.abcdefghijk',
    'url=https://example.test/?api_key=abc123&token=xyz987',
    'api_key=standalone-secret',
    'NPM_TOKEN=npm-prefixed-secret',
    'DATABASE_PASSWORD=db-prefixed-secret',
    'JWT_SECRET=jwt-prefixed-secret',
    '{"client_secret":"hidden","password":"also-hidden"}',
    'owner@example.com',
    'wrapped=(second.user+ci@example.co.uk),',
    'unicode=owner@例子.公司',
    'supplementary=owner@𐐷𐐯𐑅𐐻.𐐿𐐬𐑋',
    'not-an-email=@localhost',
    'compile error at backend/src/index.ts:42',
  ].join('\n')
  const output = sanitizeCiLog(input)
  for (const secret of [
    'super-secret',
    'dXNlcjpwYXNz',
    'camel-auth-secret',
    'quoted-auth-secret',
    'ghs_1234567890abcdefghijklmnop',
    'secret-value',
    'dp.st.abcdefghijklmnopqrstuvwxyz',
    'eyJabcdefghijk.abcdefghijk.abcdefghijk',
    'abc123',
    'xyz987',
    'standalone-secret',
    'npm-prefixed-secret',
    'db-prefixed-secret',
    'jwt-prefixed-secret',
    'hidden',
    'also-hidden',
    'owner@example.com',
    'second.user+ci@example.co.uk',
    'owner@例子.公司',
    'owner@𐐷𐐯𐑅𐐻.𐐿𐐬𐑋',
  ]) {
    assert.equal(output.includes(secret), false, secret)
  }
  assert.match(output, /not-an-email=@localhost/)
  assert.match(output, /compile error at backend\/src\/index\.ts:42/)
})

test('bounded tail limits model exposure', () => {
  const input = Array.from({ length: 2000 }, (_, i) => `line-${i}`).join('\n')
  const output = boundedSanitizedTail(input, { maxLines: 100, maxChars: 1000 })
  assert.equal(output.includes('line-0'), false)
  assert.ok(output.length <= 1000)
  assert.match(output, /line-1999/)
})
