import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const htmlPath = 'tools/admob-ssv-verification-values.html';

test('offline generator has no network or persistent-storage capabilities', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');

  assert.match(html, /crypto\.randomUUID\(\)/);
  assert.match(html, /admob-verify-/);
  assert.match(html, /15 dakika/i);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/i);
  assert.doesNotMatch(
    html,
    /localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker/i
  );
  assert.equal((html.match(/navigator\.clipboard\.writeText/g) ?? []).length, 2);
});

test('generates deterministic in-memory values with a fifteen-minute expiry', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'Inline generator script is required.');

  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        value: '',
        hidden: false,
        disabled: false,
        addEventListener() {}
      });
    }
    return elements.get(id);
  };

  const context = {
    console,
    crypto: { randomUUID: () => 'unused' },
    navigator: { clipboard: { writeText: async () => {} } },
    document: { getElementById: element },
    Date
  };
  context.globalThis = context;
  vm.runInNewContext(script, context, { filename: htmlPath });

  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
  ];
  const values = context.generateValues(
    () => ids.shift(),
    new Date('2026-07-27T10:00:00.000Z')
  );

  assert.deepEqual(JSON.parse(JSON.stringify(values)), {
    userId: 'admob-verify-11111111-1111-4111-8111-111111111111',
    customData: '22222222-2222-4222-8222-222222222222',
    generatedAt: '2026-07-27T10:00:00.000Z',
    expiresAt: '2026-07-27T10:15:00.000Z'
  });
});
