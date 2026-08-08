import { describe, expect, it } from 'vitest';

import {
  CLOUDFLARE_SECRET_NAMES,
  resolveCloudflareSecrets,
} from '../../scripts/shared';

function createSecrets(): Record<string, string> {
  return Object.fromEntries(CLOUDFLARE_SECRET_NAMES.map((name) => [name, `doppler-${name}`]));
}

describe('Cloudflare secret resolution', () => {
  it('keeps all admin credentials out of the generic deploy allowlist', () => {
    expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_SECRET');
    expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_CONTENT_SECRET');
    expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_NOTIFICATION_SECRET');
    expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_PLAY_READ_SECRET');
    expect(CLOUDFLARE_SECRET_NAMES).not.toContain('ADMIN_PLAY_WRITE_SECRET');
    expect(CLOUDFLARE_SECRET_NAMES).not.toContain('PLAY_WEBHOOK_SECRET');
  });

  it('uses environment overrides without changing other Doppler secrets', () => {
    const resolved = resolveCloudflareSecrets(createSecrets(), {
      JWT_SECRET: 'github-jwt-secret',
    });

    expect(resolved.JWT_SECRET).toBe('github-jwt-secret');
    expect(resolved.ADMOB_REWARDED_ID).toBe('doppler-ADMOB_REWARDED_ID');
  });

  it('requires every generic Cloudflare secret', () => {
    const secrets = createSecrets();
    delete secrets.JWT_SECRET;

    expect(() => resolveCloudflareSecrets(secrets, {})).toThrow(
      'Required Cloudflare secret is missing: JWT_SECRET',
    );
  });
});
