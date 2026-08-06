import fs from 'node:fs';
import path from 'node:path';

export function loadStoreConfig(rootDir) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, 'Astroloji/play/store-config.json'), 'utf8'),
  );
}

export function readAndroidLocales(rootDir) {
  const xml = fs.readFileSync(
    path.join(rootDir, 'Astroloji/app/src/main/res/xml/locales_config.xml'),
    'utf8',
  );
  return [...xml.matchAll(/android:name="([^"]+)"/g)]
    .map((match) => match[1])
    .sort();
}

export function assertLocaleContract(config, androidLocales) {
  const unmapped = androidLocales.filter((locale) => !config.androidLocaleMap[locale]);
  if (unmapped.length) {
    throw new Error(`Missing Android locale mapping: ${unmapped.join(', ')}`);
  }

  const mapped = androidLocales.map((locale) => config.androidLocaleMap[locale]).sort();
  const proposed = [...config.locales].sort();
  const unsupported = proposed.filter((locale) => !mapped.includes(locale));
  const missing = mapped.filter((locale) => !proposed.includes(locale));

  if (unsupported.length) {
    throw new Error(`Unsupported Play locale: ${unsupported.join(', ')}`);
  }
  if (missing.length) {
    throw new Error(`Missing Play locale: ${missing.join(', ')}`);
  }
}
