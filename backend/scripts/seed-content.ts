import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDocumentsForSeed } from '@/utils/contentSeed';

function readBucketName(): string {
  const wranglerToml = readFileSync(path.resolve('wrangler.toml'), 'utf8');
  const match = wranglerToml.match(/bucket_name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('bucket_name could not be found in wrangler.toml');
  }
  return match[1];
}

function upload(bucketName: string, key: string, filePath: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      execSync(`npx wrangler r2 object put "${bucketName}/${key}" --remote --file "${filePath}"`, {
        stdio: 'inherit',
        shell: process.env.ComSpec
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 5) {
        break;
      }

      const waitMs = attempt * 1500;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }

  throw lastError;
}

function main() {
  const bucketName = readBucketName();
  const tempDir = mkdtempSync(path.join(tmpdir(), 'astrology-seed-'));
  const dailyDays = process.env.SEED_DAILY_DAYS ? Number.parseInt(process.env.SEED_DAILY_DAYS, 10) : undefined;
  const skipStaticContent =
    process.env.SEED_SKIP_STATIC_CONTENT === '1' ||
    process.env.SEED_SKIP_STATIC_CONTENT?.toLowerCase() === 'true';

  try {
    for (const item of buildDocumentsForSeed({
      seedDate: process.env.SEED_DATE,
      dailyDays,
      skipStaticContent
    })) {
      const safeName = item.key.replace(/[\\/]/g, '__');
      const filePath = path.join(tempDir, safeName);
      writeFileSync(filePath, JSON.stringify(item.payload, null, 2), 'utf8');
      upload(bucketName, item.key, filePath);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main();
}
