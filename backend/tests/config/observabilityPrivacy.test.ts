import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workerConfigs = ['wrangler.toml', 'wrangler.transition.toml'];

describe('Worker observability privacy', () => {
  it.each(workerConfigs)('%s redacts query strings from persisted request logs', (configFile) => {
    const config = readFileSync(new URL('../../' + configFile, import.meta.url), 'utf8');
    const lines = config.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === '[observability]');
    expect(start).toBeGreaterThanOrEqual(0);

    const settings: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.trim().startsWith('[')) break;
      settings.push(line);
    }

    expect(settings.join('\n')).toMatch(/^redact_query_string\s*=\s*true\s*(?:#.*)?$/m);
  });
});
