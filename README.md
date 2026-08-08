# Astroloji Repo

Android istemcisi ve Cloudflare Worker backend'inden olusan bu repo, gunluk/haftalik/aylik astroloji icerigi, premium abonelik, bildirim ve analytics akislarini birlikte tasir.

## Kapsam

- `Astroloji/`: Jetpack Compose tabanli Android uygulamasi
- `backend/`: Hono + Cloudflare Workers backend'i
- `scripts/`: repo seviyesinde yardimci dogrulama scriptleri

Bu repo yeni bir web/admin paneli icermiyor. Public API path'leri korunur:

- `/api/v1/users/*`
- `/api/v1/content/*`
- `/api/v1/subscriptions/*`
- `/api/v1/notifications/send`

## Mimari Ozet

- Android tarafinda Hilt, Room, DataStore, Retrofit/OkHttp, Firebase, WorkManager, Glance widget ve Play Billing kullanilir.
- Backend tarafinda Hono route katmani, D1 veritabani, R2 content store, KV cache/rate limit, Firebase FCM ve Google Play Developer API entegrasyonu vardir.
- Doppler, backend secret'lari icin source of truth olarak kullanilir.

## Lokal Kurulum

### Gereksinimler

- JDK 21
- Node.js 24+
- npm 10+
- Wrangler CLI
- Doppler CLI (secret sync kullaniyorsaniz)

### Android

1. `Astroloji/gradle.properties.example` dosyasini referans alip lokal `gradle.properties` veya kullanici-level Gradle properties tanimlayin.
2. Gercek `google-services.json` dosyasini `Astroloji/app/google-services.json` yoluna koyun.
3. Test veya CI icin gercek Firebase config'iniz yoksa ornek dosyayi kopyalayin:

```powershell
Copy-Item Astroloji/app/google-services.example.json Astroloji/app/google-services.json
```

4. Calistirma ve test:

```powershell
cd Astroloji
.\gradlew.bat test
.\gradlew.bat :app:assembleDebug
```

### Backend

1. `backend/.dev.vars.example` dosyasini referans alin.
2. Doppler kullaniyorsaniz:

```powershell
cd backend
npm ci
npm run doppler:devvars
```

3. Lokal test ve build:

```powershell
cd backend
npm ci
npm test
npm run test:runtime
npm run build
```

## Secret Yonetimi

Repoda gercek secret tutulmaz. Asagidaki dosyalar lokal/CI secret store uzerinden uretilmelidir:

- `Astroloji/app/google-services.json`
- `backend/.dev.vars`
- Google Play service account JSON dosyasi

### Android Gradle property anahtarlari

- `ADMOB_APP_ID`
- `ADMOB_BANNER_ID`
- `ADMOB_INTERSTITIAL_ID`
- `ADMOB_REWARDED_ID`
- `ADMOB_REWARDED_INTERSTITIAL_ID`
- `ADMOB_APP_OPEN_ID`
- `ADMOB_NATIVE_ADVANCED_ID`
- `ADMOB_USE_TEST_IDS`
- `PLAY_TRACK`
- `PLAY_SERVICE_ACCOUNT_JSON_PATH`
- `PRIVACY_POLICY_URL`
- `TERMS_OF_USE_URL`
- `SUPPORT_EMAIL`

### Backend secret anahtarlari

- `JWT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `PLAY_WEBHOOK_SECRET`
- `ADMOB_REWARDED_ID`
- Scoped admin credentials are isolated by capability: `ADMIN_CONTENT_SECRET`, `ADMIN_NOTIFICATION_SECRET`, `ADMIN_PLAY_READ_SECRET`, `ADMIN_PLAY_WRITE_SECRET`. They are not owned by the generic backend deploy flow.

## Deploy Akisi

### Android release

1. Release Gradle properties ve signing bilgilerini GitHub Environment Secrets olarak tanimla.
2. Play Publisher service account JSON'unu `PLAY_SERVICE_ACCOUNT_JSON` secret'i olarak sakla.
3. `main` merge sonrasi `android-internal-release` workflow'u signed `AAB` uretip `internal` track'e yollar.
4. Production publish icin `android-production-release` workflow'unu manuel tetikle; default rollout `%10` staged rollout'tur.
5. Store listing ve release notes degisikliklerini `android-metadata` workflow'u ile ayri yonet.
6. Release artifact'i repoya commit etme; GitHub Actions artifact olarak saklanir.

### Backend release

Tek kaynak `backend/wrangler.toml` dosyasidir. Ayrik deploy config tutulmaz.

```powershell
cd backend
npm ci
npm run types:generate
npm run build
npm test
npm run test:runtime
npm run deploy:doppler
```

## CI/CD

GitHub Actions workflow:

- `ci`: secret scan, backend verify ve Android verify zinciri
- `android-internal-release`: `main` merge sonrasi signed `AAB` ile `internal` track publish
- `android-production-release`: manuel onayli `production` staged rollout publish veya promote
- `android-metadata`: Play listing ve release notes validasyonu, manuel metadata publish
- `content-backfill` workflow'u `ENABLE_CONTENT_BACKFILL=true` iken her gun 01:15 UTC'de hafif seed calistirir; manuel dispatch her zaman kullanilabilir. Varsayilan olarak `SEED_DAILY_DAYS=14` ve `SEED_SKIP_STATIC_CONTENT=true` kullanir

### GitHub environment secret'lari

Onerilen model:

- Doppler secret'larin source of truth olur
- GitHub `internal` ve `production` environment'lari sadece execution guard ve approval katmani olur
- Workflow'lar `DOPPLER_TOKEN` varsa once Doppler'dan okur; yoksa GitHub Environment Secrets fallback'ine doner

`internal` ve `production` environment'lari icin:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SERVICES_JSON`
- `DOPPLER_TOKEN` (tercih edilen yontem)
- `CRASHLYTICS_MAPPING_UPLOAD_ENABLED` (CI dry-run icin `false`, release publish icin genelde `true`)

Repo variable'lari:

- `PACKAGE_NAME=com.parsfilo.astrology`
- `PLAY_TRACK_INTERNAL=internal`
- `PLAY_TRACK_PRODUCTION=production`
- `JAVA_VERSION=21`
- `DOPPLER_PROJECT=mobil-apps`
- `DOPPLER_CONFIG=astrology`
- `ENABLE_INTERNAL_RELEASE=true` (secret ve environment kurulumu tamamlandiktan sonra)
- `ENABLE_PRODUCTION_RELEASE=true` (production approval ve secret kurulumu tamamlandiktan sonra)
- `ENABLE_METADATA_PUBLISH=true` (Play metadata publish hazir oldugunda)
- `ENABLE_CONTENT_BACKFILL=true` (zamanlanmis backfill icin; manuel dispatch bu bayragi gerektirmez)

Guvenli varsayilan olarak `ENABLE_*` bayraklari tanimli degilken publish job'lari calismaz. Bayraklari yalnizca ilgili environment secret'lari ve onay kurallari tamamlandiktan sonra ac.

Play metadata canonical kaynagi:

- `Astroloji/play/listings/<locale>/...`
- `Astroloji/play/release-notes/<locale>/default.txt`

### Doppler ile onerilen Android publish kurulumu

Mevcut workflow'lar Doppler destekler. En pratik senaryo:

1. Doppler'da `mobil-apps / astrology` config'ini Android release secret'lariyla tamamla.
2. GitHub `internal` environment icin read-only bir `DOPPLER_TOKEN` ekle.
3. GitHub `production` environment icin ayri bir read-only `DOPPLER_TOKEN` ekle.
4. Acil fallback gerekiyorsa tekil GitHub secret'lari saklanabilir; workflow once Doppler'i, sonra GitHub fallback'ini kullanir.

Android CI/CD icin Doppler'da tutulmasi onerilen anahtarlar:

- `GOOGLE_SERVICES_JSON`
- `PLAY_SERVICE_ACCOUNT_JSON` veya mevcut `GOOGLE_SERVICE_ACCOUNT_JSON`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ADMOB_APP_ID`
- `ADMOB_BANNER_ID`
- `ADMOB_INTERSTITIAL_ID`
- `ADMOB_REWARDED_ID`
- `ADMOB_REWARDED_INTERSTITIAL_ID`
- `ADMOB_APP_OPEN_ID`
- `ADMOB_NATIVE_ADVANCED_ID`

## Smoke Check

Deploy sonrasi minimum dogrulama:

1. `GET /api/v1/health` 200 donmeli.
2. Register + profile acilisi zinciri calismali.
3. En az bir `daily` content cagrisinda veri donmeli.
4. Subscription verify veya RTDN fixture akisi hata vermemeli.
5. Android debug build acilip Home -> Daily -> Premium navigation'i calismali.

## Icerik Backfill Operasyonu

Gelecek tarihli `daily/weekly/monthly` dosyalarini ucuz sekilde guncellemek icin seed araci hafif mod destekler:

```powershell
cd backend
$env:SEED_DATE='2026-03-26'
$env:SEED_DAILY_DAYS='14'
$env:SEED_SKIP_STATIC_CONTENT='true'
npm run seed
```

Kurallar:

- `SEED_DATE` bos birakilirsa bugunden baslar.
- `SEED_DAILY_DAYS` pozitif integer olmalidir.
- `SEED_SKIP_STATIC_CONTENT=true` oldugunda `personality` ve `compat` dosyalari yeniden yuklenmez.
- GitHub Actions `content-backfill` workflow'u ayni akisi zamanlanmis olarak calistirir.

Gerekli GitHub environment secret:

- `production-admin-content` environment'inda `ADMIN_CONTENT_SECRET`

Not: Zamanlanmis `content-backfill` workflow'u Cloudflare API token kullanmaz; deploy edilmis backend'deki
`/api/v1/admin/content/backfill` endpoint'ini tetikler. Generic backend deploy scoped admin credential'larini senkronlamaz.

## Secret Rotation Checklist

- Firebase service account rotate et.
- Google Play service account rotate et.
- `JWT_SECRET` rotate et.
- `PLAY_WEBHOOK_SECRET` rotate et.
- Admin credential rotasyonunu capability bazinda yap: `content-ops`, `notification-ops`, `play-read` veya `play-write`. Ilgili `production-admin-*` environment secret'ini guncelle ve `backend-admin-capability-sync` workflow'unu yalniz o capability icin calistir.
- Scoped admin credential emergency revocation/rotation'i diger capability'leri degistirmemelidir; generic backend deploy bu credential'lari yonetmez.
- Core secret rotate sonrasi Doppler ve Cloudflare secret store senkronunu tekrarla.

## Rollback

- Android: son saglam internal track build'ine don.
- Backend: son saglam Worker deploy'una don ve secret setini o release ile hizala.
- Veritabani semasi degisikliginde rollback oncesi D1 snapshot kontrol et.

## Operasyon Notu

- Ayrintili release ve deploy uygulama adimlari icin `RELEASE_RUNBOOK.md` dosyasini kullanin.
