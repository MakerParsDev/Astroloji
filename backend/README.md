# Astrology Backend

Cloudflare Workers tabanli astroloji backend'i. Bu klasor, Android istemciyi besleyen API, subscription webhook ve cron job logic'ini icerir.

## Stack

- TypeScript + Hono
- Cloudflare Workers
- D1 + R2 + KV
- Firebase Cloud Messaging HTTP v1
- Google Play Developer API Subscriptions v2

## Tek Kaynakli Deploy Config

Deploy icin sadece `wrangler.toml` kullanilir. Ayrik deploy config tutulmaz.

## Hizli Baslangic

```powershell
cd backend
npm ci
npm test
npm run test:runtime
npm run build
```

## Lokal Secret Akisi

- Ornek dosya: `.dev.vars.example`
- Gercek lokal dosya: `.dev.vars`
- Onerilen akis: `npm run doppler:devvars`

Cloudflare secret store'a giden anahtarlar:

- `JWT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `PLAY_WEBHOOK_SECRET`
- `ADMIN_SECRET`
- `ADMOB_REWARDED_ID`

## Scripts

- `npm run dev`
- `npm run dev:doppler`
- `npm run build`
- `npm test`
- `npm run test:runtime`
- `npm run types:generate`
- `npm run types:check`
- `npm run doppler:devvars`
- `npm run doppler:cf-secrets`
- `npm run deploy:doppler`
- `npm run schema:apply`
- `npm run seed`

## API ve Guvenlik

- `POST /api/v1/users/register` Firebase ID token ister.
- `GET/PUT /api/v1/users/me` uygulama JWT'si ister.
- `GET /api/v1/content/*` uygulama JWT'si ister.
- `POST /api/v1/subscriptions/verify` uygulama JWT'si ister.
- `POST /api/v1/subscriptions/restore` uygulama JWT'si ister.
- `POST /api/v1/rewards/prepare` uygulama JWT'si ile kısa ömürlü challenge üretir.
- `GET /api/v1/rewards/ssv` AdMob imzalı callback endpoint'idir ve istemci kimliğiyle erişim vermez.
- `POST /api/v1/rewards/claim` yalnızca doğrulanmış challenge kimliğini tüketir.
- `POST /api/v1/events/track` uygulama JWT'si ister.
- `POST /api/v1/webhooks/play-rtdn?token=...` query token ile korunur. `X-Play-Secret` sadece gecis donemi fallback olarak aciktir.
- `POST /api/v1/notifications/send` sadece `X-Admin-Secret` ile korunur.
- `GET /api/v1/admin/play/subscriptions` sadece `X-Admin-Secret` ile korunur.
- `PATCH /api/v1/admin/play/subscriptions/:productId` sadece `X-Admin-Secret` ile korunur; `apply=true` verilmezse preview modunda kalir.
- `GET /api/v1/admin/subscriptions/audit` sadece `X-Admin-Secret` ile korunur.
- `GET /api/v1/admin/play/reviews` sadece `X-Admin-Secret` ile korunur.
- `POST /api/v1/admin/play/reviews/:reviewId/reply` sadece `X-Admin-Secret` ile korunur; `apply=true` verilmezse preview modunda kalir.
- Secret compare akisi timing-safe helper uzerinden yapilir.
- RTDN lookup authoritative snapshot donmezse entitlement mutate edilmez; `sync_pending` event'i yazilip sonraki reconciliation'a birakilir.

## Cache ve Rate Limit

- Cache key: `content:{lang}:{type}:{identifier}`
- TTL: daily 23 saat, weekly 6 gun, monthly 27 gun, compat/personality 30 gun
- Rate limit:
  - `/users/register`: IP basina dakikada 10
  - `/content/*`: kullanici basina dakikada 60
  - `/subscriptions/verify`: kullanici basina dakikada 5

## Operasyon Runbook

- Trial offer kontrolu: `GET /api/v1/admin/play/subscriptions` ile aylik/yillik urunleri cek; secili offer icinde sifir fiyatli pricing phase olup olmadigini dogrula.
- RTDN migration: Pub/Sub push URL'ini `https://<worker>/api/v1/webhooks/play-rtdn?token=<PLAY_WEBHOOK_SECRET>` formatina tasiyin.
- Sync pending audit: `GET /api/v1/admin/subscriptions/audit` ile son 30 gundeki bekleyen webhook kayitlarini Play snapshot'i ile reconcile edin.
- Fiyat veya offer degisikligi: once `PATCH /api/v1/admin/play/subscriptions/:productId` body'sini `apply=false` ile preview edin, sonra ayni payload'i `apply=true` ile uygulayin.

## D1 Migration Notu

Taze kurulumlar `schema.sql` uzerinden `users.subscription_state` kolonu ile gelir. Mevcut ortamlarda tek seferlik D1 migration icin asagidaki SQL'i uygulayin:

```sql
ALTER TABLE users ADD COLUMN subscription_state TEXT NOT NULL DEFAULT 'expired';
CREATE INDEX IF NOT EXISTS idx_users_subscription_state ON users(subscription_state);
```

## Notlar

- RTDN webhook parse akisi tip guvenli tutulur; eksik payload durumunda 400 doner.
- FCM tarafinda `registration-token-not-registered` / `UNREGISTERED` token'lari otomatik silinir.
- Worker binding tipleri elle yazilmaz; `npm run types:generate` ile `worker-configuration.d.ts` uretilir.
- `nodejs_compat` bilerek acik degil; mevcut Worker kodu web-standard API'lerle calisiyor ve ekstra Node polyfill yuzeyi tasinmiyor.
- Daha genis deploy, rotate ve smoke-check adimlari icin repo kokundeki `README.md` dosyasina bak.

## Rewarded Ad SSV Kurulumu

Production gecisi icin tam backend'i hemen deploy etmeyin. `astrology-ssv-transition` Worker'i canli malformed callback icin `400 / MALFORMED_CALLBACK` donmeli ve `ENABLE_PRODUCTION_RELEASE=false` kalmalidir.

Guvenli operator sirasi: `create -> AdMob -> inspect verified -> delete`.

1. Gecis Worker'i gerekiyorsa `backend-ssv-transition-deploy` workflow'u ile `main` uzerinden deploy edin; onay `DEPLOY_TRANSITION` ve gelecekte UTC deadline kullanin.
2. Yerel bilgisayarda repo kokundeki `tools/admob-ssv-verification-values.html` dosyasini tarayicida acin, yeni degerler uretin ve sayfayi AdMob testi bitene kadar acik tutun.
3. GitHub repository Actions secrets alanina su iki gecici secret'i kaydedin:
   - `ADMOB_SSV_TEST_USER_ID`
   - `ADMOB_SSV_TEST_CUSTOM_DATA`
4. `backend-admob-ssv-verification-challenge` workflow'unu `main` uzerinden calistirin:
   - command: `create`
   - confirm: `MANAGE_ADMOB_SSV_CHALLENGE`
   Workflow ozetinde yalnizca prefix, `pending` status ve 15 dakikalik expiry bulunmalidir.
5. AdMob SSV ekraninda su alanlari kullanin:

   ```text
   Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
   User ID: acik tuttugunuz yerel sayfadaki User ID
   Custom data: acik tuttugunuz yerel sayfadaki Custom data
   ```

6. **URL'yi doğrula** basarili olmadan kaydetmeyin. Basaridan sonra **Doğrulanan URL'yi kullan** ve **Kaydet**.
7. Ayni workflow'u command `inspect`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistirin. Redakte evidence icinde status `verified` ve transaction prefix bulunmalidir.
8. Ayni workflow'u command `delete`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistirin. Exact D1 challenge satiri silinmelidir. Ardindan GitHub Actions ayarlarindan `ADMOB_SSV_TEST_USER_ID` ve `ADMOB_SSV_TEST_CUSTOM_DATA` secret'larini manuel silin.
9. Rollback gerektiginde `backend-ssv-transition-rollback` exact route'u kaldirir; `astrology-backend` ve additif D1 tablolari degismez.
