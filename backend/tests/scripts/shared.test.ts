import { describe, expect, it } from 'vitest';

import {
  CLOUDFLARE_SECRET_NAMES,
  resolveCloudflareSecrets,
} from '../../scripts/shared';

function createSecrets(): Record<string, string> {
  return Object.fromEntries(CLOUDFLARE_SECRET_NAMES.map((name) => [name, `doppler-${name}`]));
}

describe('Cloudflare secret resolution', () => {
  it('uses environment overrides without changing other Doppler secrets', () => {
    const resolved = resolveCloudflareSecrets(createSecrets(), {
      ADMIN_SECRET: 'github-admin-secret',
    });

    expect(resolved.ADMIN_SECRET).toBe('github-admin-secret');
    expect(resolved.JWT_SECRET).toBe('doppler-JWT_SECRET');
  });

  it('requires every resolved Cloudflare secret', () => {
    const secrets = createSecrets();
    delete secrets.ADMIN_SECRET;

    expect(() => resolveCloudflareSecrets(secrets, {})).toThrow(
      'Required Cloudflare secret is missing: ADMIN_SECRET',
    );
  });
});
