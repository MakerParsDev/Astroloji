import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
// Match path segments, not substrings; `.git` must not hide `.github`.
const ignoredDirectoryNames = new Set([
  '.git',
  'node_modules',
  '.gradle',
  'build',
  'dist',
  'coverage',
  '.wrangler',
]);
const ignoredSubtrees = ['backend/SECRETS'];
const suspiciousPatterns = [
  { name: 'private key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'google api key', regex: /AIza[0-9A-Za-z\\-_]{20,}/ },
  { name: 'runtime secret assignment', regex: /(?:JWT_SECRET|PLAY_WEBHOOK_SECRET|ADMIN_SECRET)\s*=\s*['"][^'"]{12,}/ },
  { name: 'service account json', regex: /"client_email"\s*:\s*"[^"]+@[^"]+\.iam\.gserviceaccount\.com"/ },
];
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.toml',
  '.kts',
  '.kt',
  '.properties',
  '.xml',
  '.yml',
  '.yaml',
  '.env',
]);

function shouldIgnore(relativePath) {
  const segments = relativePath.replaceAll('\\', '/').split('/');
  const normalized = segments.join('/');
  return segments.some((segment) => ignoredDirectoryNames.has(segment)) ||
    ignoredSubtrees.some((subtree) => normalized === subtree || normalized.startsWith(`${subtree}/`));
}

function scanFile(relativePath, results) {
  if (shouldIgnore(relativePath)) return;
  if (!textExtensions.has(path.extname(relativePath))) return;

  const absolutePath = path.join(repoRoot, relativePath);
  const contents = fs.readFileSync(absolutePath, 'utf8');
  for (const pattern of suspiciousPatterns) {
    if (pattern.regex.test(contents)) {
      results.push(`${relativePath}: ${pattern.name}`);
    }
  }
}

function walk(currentDir, results) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
    if (shouldIgnore(relativePath)) continue;
    if (entry.isDirectory()) {
      walk(absolutePath, results);
      continue;
    }
    scanFile(relativePath, results);
  }
}

const findings = [];
walk(repoRoot, findings);

if (findings.length > 0) {
  console.error('Potential secrets detected:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Secret scan passed.');
