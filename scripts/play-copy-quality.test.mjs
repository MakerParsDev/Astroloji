import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateListingCopy } from './lib/play-copy-quality.mjs';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8').trim();
const length = (value) => [...value].length;

const trTitle = read('Astroloji/play/listings/tr-TR/title.txt');
const trShort = read('Astroloji/play/listings/tr-TR/short-description.txt');
const trFull = read('Astroloji/play/listings/tr-TR/full-description.txt');
const trNotes = read('Astroloji/play/release-notes/tr-TR/default.txt');
const enTitle = read('Astroloji/play/listings/en-US/title.txt');
const enShort = read('Astroloji/play/listings/en-US/short-description.txt');
const enFull = read('Astroloji/play/listings/en-US/full-description.txt');
const enNotes = read('Astroloji/play/release-notes/en-US/default.txt');
const allCopy = [trTitle, trShort, trFull, trNotes, enTitle, enShort, enFull, enNotes].join('\n');

test('Turkish copy uses professional Unicode and covers shipped discovery intents', () => {
  assert.match(trTitle, /[çğıöşüÇĞİÖŞÜ]/);
  assert.match(trFull, /günlük burç yorumu/i);
  assert.match(trFull, /haftalık/i);
  assert.match(trFull, /aylık/i);
  assert.match(trFull, /uyum/i);
  assert.doesNotMatch(trFull, /\bGunluk\b|\bBurc\b|\bask\b/i);
});

test('English copy covers the shipped international discovery intents', () => {
  assert.match(enFull, /daily horoscope/i);
  assert.match(enFull, /weekly/i);
  assert.match(enFull, /monthly/i);
  assert.match(enFull, /compatibility/i);
});

test('copy avoids unsupported commercial and deterministic claims', () => {
  assert.doesNotMatch(
    allCopy,
    /free trial|annual|yearly|guaranteed|accurate prediction|100% accurate|financial advice|legal advice|medical diagnosis/i,
  );
});

test('all Play text respects Unicode code-point limits', () => {
  assert.ok(length(trTitle) <= 30);
  assert.ok(length(enTitle) <= 30);
  assert.ok(length(trShort) <= 80);
  assert.ok(length(enShort) <= 80);
  assert.ok(length(trFull) <= 4000);
  assert.ok(length(enFull) <= 4000);
  assert.ok(length(trNotes) <= 500);
  assert.ok(length(enNotes) <= 500);
});

test('Turkish and English full descriptions are independently authored', () => {
  const normalize = (value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  assert.notEqual(normalize(trFull), normalize(enFull));
});

test('validator rejects unsupported commercial claims', () => {
  const errors = validateListingCopy({
    locale: 'en-US',
    title: 'Astrology',
    shortDescription: 'Start your free trial today.',
    fullDescription: 'A daily horoscope app.',
    englishFullDescription: 'A daily horoscope app.',
  });
  assert.ok(errors.some((error) => /free trial/i.test(error)));
});

test('validator rejects fallback English assigned to a non-English locale', () => {
  const english = 'Daily horoscope and zodiac compatibility.';
  const errors = validateListingCopy({
    locale: 'tr-TR',
    title: 'Astroloji',
    shortDescription: 'Günlük burç yorumu.',
    fullDescription: english,
    englishFullDescription: english,
  });
  assert.ok(errors.some((error) => /duplicates en-US/i.test(error)));
});

test('validator rejects Turkish copy without Turkish Unicode quality', () => {
  const errors = validateListingCopy({
    locale: 'tr-TR',
    title: 'Astroloji Gunluk Burc',
    shortDescription: 'Gunluk burc yorumlari ve ask uyumu.',
    fullDescription: 'Gunluk burc yorumu, haftalik ve aylik rehberler.',
    englishFullDescription: 'Daily horoscope, weekly and monthly guidance.',
  });
  assert.ok(errors.some((error) => /Turkish Unicode ratio/i.test(error)));
});

test('validator rejects every excluded commercial/deterministic claim in English and Turkish', () => {
  const cases = [
    ['en-US', 'free trial'], ['tr-TR', 'ücretsiz deneme'],
    ['en-US', 'yearly plan'], ['tr-TR', 'yıllık plan'],
    ['en-US', 'guaranteed result'], ['tr-TR', 'garantili sonuç'],
    ['en-US', 'medical diagnosis'], ['tr-TR', 'tıbbi teşhis'],
    ['en-US', 'financial advice'], ['tr-TR', 'finansal tavsiye'],
    ['en-US', 'legal advice'], ['tr-TR', 'hukuki danışmanlık'],
    ['en-US', '100% accurate'], ['tr-TR', '%100 doğru'],
    ['en-US', 'psychic reading'], ['tr-TR', 'medyum yorumu'],
  ];
  for (const [locale, claim] of cases) {
    const errors = validateListingCopy({
      locale,
      title: locale === 'tr-TR' ? 'Astroloji Günlük Burç' : 'Astrology Daily Horoscope',
      shortDescription: claim,
      fullDescription: locale === 'tr-TR' ? 'Günlük burç yorumu ve uyum.' : 'Daily horoscope and compatibility.',
      englishFullDescription: 'Daily horoscope and compatibility.',
    });
    assert.ok(errors.some((error) => /forbidden claim/i.test(error)), `${locale} should reject: ${claim}`);
  }
});
