import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT_README = resolve(process.cwd(), '../README.md');
const RELEASE_RUNBOOK = resolve(process.cwd(), '../RELEASE_RUNBOOK.md');

describe('retired Play webhook secret docs contract', () => {
  it('does not list the retired PLAY_WEBHOOK_SECRET as an active backend secret in the root README', () => {
    const readme = readFileSync(ROOT_README, 'utf8');

    expect(readme).not.toMatch(/-\s*`PLAY_WEBHOOK_SECRET`/);
    expect(readme).not.toMatch(/PLAY_WEBHOOK_SECRET.*rotate|rotate.*PLAY_WEBHOOK_SECRET/i);
    expect(readme).toMatch(/OIDC secret-free/i);
  });

  it('does not list the retired PLAY_WEBHOOK_SECRET as an active backend secret in the release runbook', () => {
    const runbook = readFileSync(RELEASE_RUNBOOK, 'utf8');

    expect(runbook).not.toMatch(/-\s*`PLAY_WEBHOOK_SECRET`/);
    expect(runbook).toMatch(/OIDC secret-free/i);
  });
});
