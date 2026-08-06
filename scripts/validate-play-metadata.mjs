import fs from 'node:fs';
import path from 'node:path';
import { validateListingCopy } from './lib/play-copy-quality.mjs';
import {
  assertLocaleContract,
  loadStoreConfig,
  readAndroidLocales,
} from './lib/play-store-config.mjs';

const repositoryRoot = process.cwd();
const metadataRoot = path.resolve(repositoryRoot, 'Astroloji', 'play');
const listingsRoot = path.join(metadataRoot, 'listings');
const releaseNotesRoot = path.join(metadataRoot, 'release-notes');
const storeConfig = loadStoreConfig(repositoryRoot);
const androidLocales = readAndroidLocales(repositoryRoot);

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

try {
  assertLocaleContract(storeConfig, androidLocales);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
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

const listingLocales = localeDirs.map((entry) => entry.name).sort();
const expectedLocales = [...storeConfig.locales].sort();
if (JSON.stringify(listingLocales) !== JSON.stringify(expectedLocales)) {
  fail(`Listing locale directories must be exactly: ${expectedLocales.join(', ')}`);
}

const listingPayloads = new Map();
for (const localeDir of localeDirs) {
  const localePath = path.join(listingsRoot, localeDir.name);
  const payload = {};

  for (const [fileName, maxLength] of Object.entries(listingFiles)) {
    const filePath = path.join(localePath, fileName);
    if (!fs.existsSync(filePath)) {
      fail(`Missing ${fileName} for locale ${localeDir.name}`);
      continue;
    }

    const content = readTrimmed(filePath);
    payload[fileName] = content;
    if (!content) {
      fail(`${localeDir.name}/${fileName} is empty`);
      continue;
    }

    if ([...content].length > maxLength) {
      fail(`${localeDir.name}/${fileName} exceeds ${maxLength} characters (actual ${[...content].length})`);
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

  if (Object.keys(payload).length === Object.keys(listingFiles).length) {
    listingPayloads.set(localeDir.name, payload);
  }
}

const englishFullDescription = listingPayloads.get('en-US')?.['full-description.txt'];
for (const [locale, payload] of listingPayloads) {
  const errors = validateListingCopy({
    locale,
    title: payload['title.txt'],
    shortDescription: payload['short-description.txt'],
    fullDescription: payload['full-description.txt'],
    englishFullDescription,
  });
  for (const error of errors) fail(error);
}

if (fs.existsSync(releaseNotesRoot)) {
  const noteLocales = fs.readdirSync(releaseNotesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const noteLocaleNames = noteLocales.map((entry) => entry.name).sort();
  if (JSON.stringify(noteLocaleNames) !== JSON.stringify(expectedLocales)) {
    fail(`Release-note locale directories must be exactly: ${expectedLocales.join(', ')}`);
  }

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

    if ([...content].length > 500) {
      fail(`Release notes for ${localeDir.name} exceed 500 characters (actual ${[...content].length})`);
    }
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log(`Play metadata validation passed for ${localeDirs.length} supported locale(s): ${expectedLocales.join(', ')}.`);
