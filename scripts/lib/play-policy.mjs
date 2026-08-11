const activeProviders = [
  'Firebase Authentication',
  'Firebase Analytics',
  'Firebase Crashlytics',
  'Firebase Cloud Messaging',
  'Firebase Remote Config',
  'Firebase Installations',
  'Google Mobile Ads/UMP',
  'Google Play Billing',
  'Google Play Developer API',
  'Cloudflare',
];

const requiredAnswers = [
  ['Account deletion', 'Supported'],
  ['Ads', 'Yes'],
  ['Purchases', 'Google Play subscriptions'],
  ['Data deletion request', 'Available in app'],
  ['Optional date of birth', 'Collected for app functionality'],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


function answerValues(markdown) {
  const values = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([^|:\n]+?)\s*:\s*(.+?)\s*$/u);
    if (!match) continue;
    const field = match[1].trim();
    const value = match[2].trim();
    const key = field.toLocaleLowerCase('en-US');
    const existing = values.get(key) ?? { field, values: [] };
    existing.values.push(value);
    values.set(key, existing);
  }
  return values;
}

function hasTableValue(markdown, field, value) {
  const pattern = new RegExp(
    `\\|\\s*${escapeRegExp(field)}\\s*\\|\\s*${escapeRegExp(value)}\\s*\\|`,
    'iu',
  );
  return pattern.test(markdown);
}

export function validatePolicyAnswerSet(markdown, storeConfig, matrixMarkdown) {
  const errors = [];
  const requiredTableIdentity = [
    ['Developer name', 'developer name', storeConfig.support.developer],
    ['Support e-mail', 'support e-mail', storeConfig.support.email],
    ['Website', 'website', storeConfig.support.website],
    ['Privacy policy', 'privacy policy', storeConfig.support.privacyPolicy],
    ['Account deletion URL', 'account deletion URL', storeConfig.support.accountDeletion],
  ];

  for (const [field, label, value] of requiredTableIdentity) {
    if (!hasTableValue(markdown, field, value)) {
      errors.push(`Policy answer set ${label} does not match store config: ${value}`);
    }
  }

  const parsedAnswers = answerValues(markdown);
  for (const [field, expectedValue] of requiredAnswers) {
    const entry = parsedAnswers.get(field.toLocaleLowerCase('en-US'));
    if (!entry) {
      errors.push(`Policy answer set is missing: ${field}: ${expectedValue}`);
      continue;
    }
    const distinct = [...new Set(entry.values.map((value) => value.toLocaleLowerCase('en-US')))];
    if (distinct.length > 1) {
      errors.push(`Policy answer set has conflicting values for ${field}: ${entry.values.join(' | ')}`);
      continue;
    }
    if (!entry.values[0].toLocaleLowerCase('en-US').includes(expectedValue.toLocaleLowerCase('en-US'))) {
      errors.push(`Policy answer set ${field} must include: ${expectedValue}`);
    }
  }

  if (/data cannot be deleted/i.test(markdown)) {
    errors.push('Policy answer set must not claim that data cannot be deleted');
  }

  for (const provider of activeProviders) {
    if (!markdown.includes(provider)) {
      errors.push(`Policy answer set is missing active provider: ${provider}`);
    }
    if (!matrixMarkdown.includes(provider)) {
      errors.push(`Data Safety matrix is missing active provider: ${provider}`);
    }
  }

  return errors;
}

export { activeProviders };
