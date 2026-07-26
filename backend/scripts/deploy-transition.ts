import { execFileSync } from 'node:child_process';
import path from 'node:path';

const config = process.env.TRANSITION_WRANGLER_CONFIG;
if (!config) {
  throw new Error('TRANSITION_WRANGLER_CONFIG is required for transition deployment.');
}
if (!config.endsWith('.toml') || !path.basename(config).includes('transition')) {
  throw new Error('Transition deployment requires a transition-specific TOML config.');
}

execFileSync('npx', ['wrangler', 'deploy', '--config', config], {
  cwd: path.resolve('.'),
  stdio: 'inherit'
});
