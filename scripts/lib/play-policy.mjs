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

const requiredAnswerLines = [
  'Account deletion: Supported',
  'Ads: Yes',
  'Purchases: Google Play subscriptions',
  'Data deletion request: Available in app',
  'Optional date of birth: Collected ephemerally for app functionality',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  for (const requiredLine of requiredAnswerLines) {
    if (!markdown.toLowerCase().includes(requiredLine.toLowerCase())) {
      errors.push(`Policy answer set is missing: ${requiredLine}`);
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
