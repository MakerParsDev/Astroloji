const forbiddenClaims = [
  ['free trial', /free trial/i],
  ['annual or yearly plan', /annual|yearly/i],
  ['guaranteed outcome', /guaranteed/i],
  ['medical or diagnosis claim', /medical|diagnos/i],
  ['financial advice', /financial advice/i],
  ['legal advice', /legal advice/i],
  ['100% accurate claim', /100% accurate/i],
];

function normalize(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function turkishUnicodeRatio(value) {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const turkishSpecific = value.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? [];
  return turkishSpecific.length / letters.length;
}

export function validateListingCopy({
  locale,
  title,
  shortDescription,
  fullDescription,
  englishFullDescription,
}) {
  const errors = [];
  const combined = [title, shortDescription, fullDescription].join('\n');

  for (const [label, pattern] of forbiddenClaims) {
    if (pattern.test(combined)) {
      errors.push(`${locale} contains forbidden claim: ${label}`);
    }
  }

  if (
    locale !== 'en-US' &&
    englishFullDescription &&
    normalize(fullDescription) === normalize(englishFullDescription)
  ) {
    errors.push(`${locale} full description duplicates en-US copy`);
  }

  if (locale === 'tr-TR' && turkishUnicodeRatio(combined) < 0.01) {
    errors.push('tr-TR Turkish Unicode ratio is below 1%');
  }

  return errors;
}
