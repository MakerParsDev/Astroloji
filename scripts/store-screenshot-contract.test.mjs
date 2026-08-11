import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sourcePath = 'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreListingScreenshotTest.kt';
const fixturePath = 'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreScreenshotFixtures.kt';
const scenePath = 'Astroloji/play/assets/source/store-scenes.json';
const buildPath = 'Astroloji/app/build.gradle.kts';

const previews = [
  'StoreDailyEnglishScreenshot', 'StoreGuidanceEnglishScreenshot', 'StoreToolsEnglishScreenshot',
  'StoreCompatibilityEnglishScreenshot', 'StorePersonalityEnglishScreenshot', 'StorePremiumEnglishScreenshot',
  'StoreDailyTurkishScreenshot', 'StoreGuidanceTurkishScreenshot', 'StoreToolsTurkishScreenshot',
  'StoreCompatibilityTurkishScreenshot', 'StorePersonalityTurkishScreenshot', 'StorePremiumTurkishScreenshot',
  'StoreDailySpanishScreenshot', 'StoreGuidanceSpanishScreenshot', 'StoreToolsSpanishScreenshot',
  'StoreCompatibilitySpanishScreenshot', 'StorePersonalitySpanishScreenshot', 'StorePremiumSpanishScreenshot',
];
const captureScenes = ['daily', 'weekly', 'monthly', 'compatibility', 'profile', 'premium'];

test('phone previews keep stable names and use real-device marketing frames', () => {
  assert.ok(fs.existsSync(sourcePath), 'Store listing screenshot source must exist.');
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const preview of previews) assert.match(source, new RegExp(preview));
  assert.equal((source.match(/@PreviewTest/g) ?? []).length, 18);
  assert.match(source, /spec:width=360dp,height=800dp,dpi=480/);
  assert.match(source, /painterResource/);
  assert.match(source, /ContentScale\.Crop/);
  assert.match(source, /FontWeight\.ExtraBold/);
  assert.match(source, /maxLines\s*=\s*2/);
  assert.doesNotMatch(source, /InsightMeter\(/);
  assert.doesNotMatch(source, /PremiumOfferCard\(/);
  assert.doesNotMatch(source, /AstrologyCard\s*\{/);
  assert.doesNotMatch(source, /email|token|firebase|device id|test user/i);
});


test('screenshot-only raw captures are included in the debug resource table', () => {
  const build = fs.readFileSync(buildPath, 'utf8');
  assert.match(build, /if \(screenshotTestsEnabled\) \{[\s\S]{0,400}sourceSets\.named\("debug"\)[\s\S]{0,400}res\.directories\s*\+=\s*"src\/screenshotTest\/res"/);
});

test('all eighteen raw device captures are wired into phone previews', () => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const locale of ['en', 'tr', 'es']) {
    for (const scene of captureScenes) {
      assert.match(source, new RegExp(`R\\.drawable\\.store_capture_${locale}_${scene}`));
    }
  }
});

test('phone scene manifest declares real-device sources in capture order', () => {
  const manifest = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  const phones = manifest.scenes.filter((scene) => scene.role === 'phoneScreenshot');
  assert.equal(phones.length, 18);
  assert.ok(phones.every((scene) => scene.sourceKind === 'realDeviceCapture'));
  for (const locale of ['en-US', 'tr-TR', 'es-ES']) {
    const rows = phones.filter((scene) => scene.locale === locale).sort((a, b) => a.order - b.order);
    assert.deepEqual(rows.map((row) => row.order), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(rows.map((row) => row.path.split('/').at(-1)), [
      '01-daily.png', '02-weekly.png', '03-monthly.png', '04-compatibility.png', '05-profile.png', '06-premium.png',
    ]);
  }
});

test('localized marketing copy uses the six approved headlines per locale', () => {
  const fixtures = fs.readFileSync(fixturePath, 'utf8');
  for (const headline of [
    "See today's horoscope at a glance",
    'See the rhythm of your week ahead',
    'Explore the bigger picture this month',
    'Compare zodiac compatibility clearly',
    'Personalize your zodiac profile',
    'Choose monthly or weekly Premium',
    'Bugünün burç yorumunu tek bakışta gör',
    'Haftanın ritmini önceden yakala',
    'Ayın büyük resmini keşfet',
    'Burç uyumunu net puanlarla karşılaştır',
    'Burç profilini kişiselleştir',
    'Aylık veya haftalık Premium seç',
    'Mira tu horóscopo de hoy de un vistazo',
    'Descubre el ritmo de tu semana',
    'Explora el panorama completo del mes',
    'Compara la compatibilidad zodiacal',
    'Personaliza tu perfil zodiacal',
    'Elige Premium mensual o semanal',
  ]) assert.match(fixtures, new RegExp(headline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('CI explicitly validates paywall and Play store screenshot suites', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /name:\s*Play store and paywall screenshot tests/);
  assert.match(ci, /validateDebugScreenshotTest/);
  assert.match(ci, /android\.experimental\.enableScreenshotTest=true/);
  assert.match(ci, /android\.sync\.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE/);
});

test('feature graphics and shared icon retain deterministic Compose previews', () => {
  const featurePath = 'Astroloji/app/src/screenshotTest/kotlin/com/parsfilo/astrology/store/StoreFeatureGraphicScreenshotTest.kt';
  const source = fs.readFileSync(featurePath, 'utf8');
  for (const preview of [
    'StoreFeatureGraphicEnglishScreenshot',
    'StoreFeatureGraphicTurkishScreenshot',
    'StoreFeatureGraphicSpanishScreenshot',
    'StoreAppIconScreenshot',
  ]) {
    assert.match(source, new RegExp(preview));
  }
  assert.equal((source.match(/@PreviewTest/g) ?? []).length, 4);
  assert.match(source, /spec:width=1024dp,height=500dp,dpi=160/);
  assert.match(source, /spec:width=512dp,height=512dp,dpi=160/);
  assert.doesNotMatch(source, /rating|award|testimonial|countdown|discount/i);
});
