import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTION_KEYS = {
  play: ['productionRolloutFraction', 'ratings', 'reviews'],
  stability: ['crashRate', 'anrRate'],
  analytics: ['activeUsers', 'sessions', 'events'],
  subscriptions: ['premiumScreenViews', 'purchaseStarts', 'verifiedPurchases'],
  ads: ['requests', 'matchedRequests', 'impressions'],
};

const IDENTITY_KEY_PATTERN = /(account.*email|email|user.?id|device.?id|advertising.?id|gaid|tester|client.?id|publisher.?id)/i;

export function metric(value, source) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    throw new Error('Measured metric value must be numeric.');
  }
  if (!source || !String(source).trim()) {
    throw new Error('Measured metric source is required.');
  }
  return { value: Number(value), source: String(source).trim() };
}

export function unavailableMetric(reason) {
  if (!reason || !String(reason).trim()) {
    throw new Error('Unavailable metric reason is required.');
  }
  return { value: null, unavailableReason: String(reason).trim() };
}

function normalizeMetric(value, fallbackReason) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return structuredClone(value);
  }
  return unavailableMetric(fallbackReason);
}

export function buildPlayBaseline(input) {
  const baseline = {
    schemaVersion: 1,
    collectedAt: input.collectedAt,
    window: structuredClone(input.window ?? {}),
  };

  for (const [section, keys] of Object.entries(SECTION_KEYS)) {
    baseline[section] = {};
    for (const key of keys) {
      baseline[section][key] = normalizeMetric(
        input?.[section]?.[key],
        'Metric was not supplied by the capture source.',
      );
    }
  }
  return baseline;
}

function parseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function findIdentityKeys(value, prefix = '') {
  const errors = [];
  if (!value || typeof value !== 'object') return errors;
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (IDENTITY_KEY_PATTERN.test(key)) {
      errors.push(`Identity-bearing field is not allowed in baseline: ${full}`);
    }
    if (child && typeof child === 'object') errors.push(...findIdentityKeys(child, full));
  }
  return errors;
}

export function validateBaseline(baseline) {
  const errors = [];
  if (baseline?.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (!baseline?.collectedAt || !Number.isFinite(Date.parse(baseline.collectedAt))) {
    errors.push('collectedAt must be an ISO timestamp.');
  }

  const start = parseDate(baseline?.window?.start);
  const end = parseDate(baseline?.window?.end);
  if (start === null || end === null) {
    errors.push('window start/end must use YYYY-MM-DD.');
  } else {
    const inclusiveDays = Math.round((end - start) / 86_400_000) + 1;
    if (inclusiveDays !== 30) errors.push(`Baseline window must be exactly 30-day inclusive; got ${inclusiveDays}.`);
  }

  for (const [section, keys] of Object.entries(SECTION_KEYS)) {
    for (const key of keys) {
      const item = baseline?.[section]?.[key];
      const label = `${section}.${key}`;
      if (!item || typeof item !== 'object' || !Object.prototype.hasOwnProperty.call(item, 'value')) {
        errors.push(`${label} must be a metric object.`);
        continue;
      }
      if (item.unavailableReason !== undefined) {
        if (item.value !== null) errors.push(`${label} value must be null when unavailableReason is present.`);
        if (!String(item.unavailableReason ?? '').trim()) errors.push(`${label} unavailableReason must be non-empty.`);
      } else {
        if (typeof item.value !== 'number' || !Number.isFinite(item.value)) {
          errors.push(`${label} measured value must be a finite number.`);
        }
        if (!String(item.source ?? '').trim()) errors.push(`${label} measured metric source is required.`);
      }
    }
  }

  const rollout = baseline?.play?.productionRolloutFraction;
  if (rollout?.value !== null && rollout?.value !== undefined) {
    if (rollout.value < 0 || rollout.value > 1) errors.push('play.productionRolloutFraction must be between 0 and 1.');
  }

  errors.push(...findIdentityKeys(baseline));
  return errors;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

export function writeBaselineFile({ inputPath, outputPath }) {
  if (!inputPath || !outputPath) throw new Error('--input and --output are required.');
  const input = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
  const baseline = buildPlayBaseline(input);
  const errors = validateBaseline(baseline);
  if (errors.length) throw new Error(`Baseline validation failed:\n- ${errors.join('\n- ')}`);
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(baseline, null, 2)}\n`, { mode: 0o644 });
  return baseline;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const baseline = writeBaselineFile({ inputPath: args.input, outputPath: args.output });
    console.log(`Play store baseline written for ${baseline.window.start}..${baseline.window.end}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
