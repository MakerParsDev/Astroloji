import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readDatabaseName(): string {
  const wranglerToml = readFileSync(path.resolve('wrangler.toml'), 'utf8');
  const match = wranglerToml.match(/database_name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error('database_name could not be found in wrangler.toml');
  }
  return match[1];
}

function main() {
  const databaseName = readDatabaseName();
  execSync(`npx wrangler d1 execute ${databaseName} --remote --file=schema.sql`, {
    stdio: 'inherit',
    shell: process.env.ComSpec
  });
}

main();
