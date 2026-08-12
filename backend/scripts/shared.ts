import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const DOPPLER_PROJECT = process.env.DOPPLER_PROJECT ?? 'mobil-apps';
export const DOPPLER_CONFIG = process.env.DOPPLER_CONFIG ?? 'astrology';
export const CLOUDFLARE_SECRET_NAMES = [
  'JWT_SECRET',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'ADMOB_REWARDED_ID',
  'BIRTH_DATA_ENCRYPTION_KEY',
  'ADMIN_PANEL_ALLOWED_EMAILS',
] as const;

export type CloudflareSecretName = (typeof CLOUDFLARE_SECRET_NAMES)[number];


export const TRANSITION_SECRET_NAMES = ['JWT_SECRET', 'ADMOB_REWARDED_ID'] as const;
export type TransitionSecretName = (typeof TRANSITION_SECRET_NAMES)[number];

export interface NpxInvocation {
  executable: string;
  shell: boolean;
}

export function resolveNpxInvocation(
  platform: NodeJS.Platform = process.platform,
): NpxInvocation {
  return platform === 'win32'
    ? { executable: 'npx.cmd', shell: true }
    : { executable: 'npx', shell: false };
}

export function resolveTransitionSecrets(
  dopplerSecrets: Record<string, string>,
  environment: NodeJS.ProcessEnv = process.env,
): Record<TransitionSecretName, string> {
  const resolved = {} as Record<TransitionSecretName, string>;
  for (const name of TRANSITION_SECRET_NAMES) {
    const value = environment[name] ?? dopplerSecrets[name];
    if (!value) {
      throw new Error(`Required transition secret is missing: ${name}`);
    }
    resolved[name] = value;
  }
  return resolved;
}

export function downloadDopplerSecrets() {
  const output = execFileSync(
    'doppler',
    [
      'secrets',
      'download',
      '--no-file',
      '--format',
      'json',
      '--project',
      DOPPLER_PROJECT,
      '--config',
      DOPPLER_CONFIG,
    ],
    {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  return JSON.parse(output) as Record<string, string>;
}

export function ensureRequiredSecrets(allSecrets: Record<string, string>) {
  for (const name of CLOUDFLARE_SECRET_NAMES) {
    if (!allSecrets[name]) {
      throw new Error(`Required Cloudflare secret is missing: ${name}`);
    }
  }
}

export function resolveCloudflareSecrets(
  dopplerSecrets: Record<string, string>,
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const resolved = { ...dopplerSecrets };
  for (const name of CLOUDFLARE_SECRET_NAMES) {
    const override = environment[name];
    if (override) {
      resolved[name] = override;
    }
  }
  ensureRequiredSecrets(resolved);
  return resolved;
}

export function writeFileEnsuringDir(filePath: string, content: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
