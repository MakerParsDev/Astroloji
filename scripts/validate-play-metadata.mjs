import fs from 'node:fs';
import path from 'node:path';

const metadataRoot = path.resolve(process.cwd(), 'Astroloji', 'play');
const listingsRoot = path.join(metadataRoot, 'listings');
const releaseNotesRoot = path.join(metadataRoot, 'release-notes');

const listingFiles = {
  'title.txt': 30,
  'short-description.txt': 80,
  'full-description.txt': 4000,
};

const bannedPatterns = [
  /Astrology App \| Daily Horoscope/i,
  /Weekly Horoscope \| Love Compatibility/i,
  /Zodiac Sign Compatibility/i,
  /Rising Sign/i,
  /Horoscope Traits/i,
  /Daily Fortune/i,
  /Astrology Guide/i,
  /bucketfish\.store/i,
  /Email\s*:/i,
];

function fail(message) {
  console.error(`Metadata validation failed: ${message}`);
  process.exitCode = 1;
}

function readTrimmed(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').trim();
}

if (!fs.existsSync(listingsRoot)) {
  fail(`Missing listings root: ${listingsRoot}`);
}

const localeDirs = fs.existsSync(listingsRoot)
  ? fs.readdirSync(listingsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];

if (localeDirs.length === 0) {
  fail('No Play listing locales found. Add Astroloji/play/listings/<locale>/ files.');
}

for (const localeDir of localeDirs) {
  const localePath = path.join(listingsRoot, localeDir.name);
  for (const [fileName, maxLength] of Object.entries(listingFiles)) {
    const filePath = path.join(localePath, fileName);
    if (!fs.existsSync(filePath)) {
      fail(`Missing ${fileName} for locale ${localeDir.name}`);
      continue;
    }

    const content = readTrimmed(filePath);
    if (!content) {
      fail(`${localeDir.name}/${fileName} is empty`);
      continue;
    }

    if (content.length > maxLength) {
      fail(`${localeDir.name}/${fileName} exceeds ${maxLength} characters (actual ${content.length})`);
    }

    if ((content.match(/\|/g) ?? []).length >= 4) {
      fail(`${localeDir.name}/${fileName} looks like keyword stuffing because it contains too many pipe separators`);
    }

    for (const pattern of bannedPatterns) {
      if (pattern.test(content)) {
        fail(`${localeDir.name}/${fileName} contains a policy-risk pattern: ${pattern}`);
      }
    }
  }
}

if (fs.existsSync(releaseNotesRoot)) {
  const noteLocales = fs.readdirSync(releaseNotesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const localeDir of noteLocales) {
    const filePath = path.join(releaseNotesRoot, localeDir.name, 'default.txt');
    if (!fs.existsSync(filePath)) {
      fail(`Missing release notes file for locale ${localeDir.name}`);
      continue;
    }

    const content = readTrimmed(filePath);
    if (!content) {
      fail(`Release notes for ${localeDir.name} are empty`);
      continue;
    }

    if (content.length > 500) {
      fail(`Release notes for ${localeDir.name} exceed 500 characters (actual ${content.length})`);
    }
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log(`Play metadata validation passed for ${localeDirs.length} locale(s).`);
