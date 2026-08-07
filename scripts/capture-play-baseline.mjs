import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliArgument } from './lib/cli-arguments.mjs';

const SECTION_KEYS = {
  play: ['productionRolloutFraction', 'ratings', 'reviews'],
  stability: ['crashRate', 'anrRate'],
  analytics: ['activeUsers', 'sessions', 'events'],
  subscriptions: ['premiumScreenViews', 'purchaseStarts', 'verifiedPurchases'],
  ads: ['requests', 'matchedRequests', 'impressions'],
};

const IDENTITY_KEY_PATTERN = /(account.*email|email|user.?id|device.?id|advertising.?id|gaid|tester|client.?id|publisher.?id)/i;
const IDENTITY_VALUE_PATTERN = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:account|user|device|client|publisher)[-_ ]?id\s*[:=])/i;

function containsIdentifier(value) {
  return IDENTITY_VALUE_PATTERN.test(String(value ?? ''));
}

export function metric(value, source) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Measured metric value must be a finite numeric value.');
  }
  if (!source || !String(source).trim()) {
    throw new Error('Measured metric source is required.');
  }
  const normalizedSource = String(source).trim();
  if (containsIdentifier(normalizedSource)) {
    throw new Error('Measured metric source must be redacted and contain no identifiers or e-mail addresses.');
  }
  return { value, source: normalizedSource };
}

export function unavailableMetric(reason) {
  if (!reason || !String(reason).trim()) {
    throw new Error('Unavailable metric reason is required.');
  }
  return { value: null, unavailableReason: String(reason).trim() };
}

function normalizeMetric(value, fallbackReason) {
  if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'value')) {
    return unavailableMetric(fallbackReason);
  }
  if (value.value === null || value.unavailableReason !== undefined) {
    return unavailableMetric(value.unavailableReason ?? fallbackReason);
  }
  return metric(value.value, value.source);
}

export function buildPlayBaseline(input) {
  const baseline = {
    schemaVersion: 1,
    collectedAt: input.collectedAt,
    window: {
      start: input?.window?.start,
      end: input?.window?.end,
    },
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
  const value = String(date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  if (new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp;
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
        if (!String(item.source ?? '').trim()) {
          errors.push(`${label} measured metric source is required.`);
        } else if (containsIdentifier(item.source)) {
          errors.push(`${label} measured metric source contains an identifier or e-mail address.`);
        }
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
    const argv = process.argv.slice(2);
    const baseline = writeBaselineFile({
      inputPath: cliArgument('input', argv),
      outputPath: cliArgument('output', argv),
    });
    console.log(`Play store baseline written for ${baseline.window.start}..${baseline.window.end}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
