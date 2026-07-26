# Release Runbook

Bu dokuman `v1.0.0` ve sonraki release'ler icin operasyon ekibinin takip edecegi tek sayfalik uygulama notudur.

## Kapsam

- Android uygulama release hazirligi
- Cloudflare Worker backend deploy adimlari
- Deploy sonrasi smoke check
- Rollback proseduru

## Preflight Checklist

Release almadan once su maddeler `PASS` olmali:

1. `main` branch temiz olmali.
2. Son GitHub Actions `ci` kosusu yesil olmali.
3. GitHub security alerts acik olmamali.
4. Android icin gerekli GitHub environment secret'lari hazir olmali.
5. Backend icin Doppler ve Cloudflare secret'lari guncel olmali.
6. R2 future content backfill son 14 gun araligini kapsiyor olmali.
7. Android publish secret'lari Doppler'da tutuluyorsa ilgili `DOPPLER_TOKEN` environment secret'lari gecerli olmali.
8. Ilgili `ENABLE_INTERNAL_RELEASE`, `ENABLE_PRODUCTION_RELEASE` veya `ENABLE_METADATA_PUBLISH` repo variable'i ancak tum secret ve approval kontrolleri tamamlandiktan sonra `true` olmali.

## Gerekli Secret'lar

### Android

- `google-services.json`
- signing keystore ve signing property'leri
- `PLAY_SERVICE_ACCOUNT_JSON`
- `PLAY_TRACK_INTERNAL`
- `PLAY_TRACK_PRODUCTION`
- `CRASHLYTICS_MAPPING_UPLOAD_ENABLED`
- `DOPPLER_TOKEN` (onerilen)
- AdMob property'leri

### Backend

- `JWT_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `PLAY_WEBHOOK_SECRET`
- `ADMIN_SECRET`
- `ADMOB_REWARDED_ID`
- `CLOUDFLARE_API_TOKEN`

## Android Release Adimlari

1. GitHub `internal` ve `production` environment secret'larinin guncel oldugunu dogrula.
2. Lokal on dogrulama calistir:

```powershell
cd Astroloji
.\gradlew.bat :app:detekt
.\gradlew.bat :app:ktlintCheck
.\gradlew.bat :app:testDebugUnitTest
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:bundleRelease
```

Not: Debug/unit verify gorevleri gerekiyorsa `app/google-services.example.json` dosyasini otomatik olarak `google-services.json` konumuna hazirlar. Release publish icin gercek secret akisi korunur.

3. Internal publish hazirsa `ENABLE_INTERNAL_RELEASE=true` repo variable'ini dogrula; `main` branch'e merge sonrasi `android-internal-release` workflow'unun yesil tamamlandigini kontrol et.
4. Internal QA tamamlandiginda `android-production-release` workflow'unu manuel tetikle.
5. Varsayilan staged rollout `%10`'dur; gerekli ise workflow input'u ile override et.
6. Metadata degisiklikleri icin `android-metadata` workflow'unu ayri calistir.
7. Release artifact'i repoya commit etme; GitHub artifact olarak saklanir.
8. Doppler modeli kullaniliyorsa `internal` ve `production` environment icin ayri read-only token tercih et.

## Rewarded SSV Gecis Worker'i

Bu gecis tam `astrology-backend` deploy'u degildir. Sadece `astrology.parsfilo.com/api/v1/rewards/*` yolu `astrology-ssv-transition` Worker'ina baglanir; diger tum yollar degismemis origin Worker'da kalir.

1. `main` uzerinde `backend-ssv-transition-deploy` workflow'unu calistir. Onay: `DEPLOY_TRANSITION`. `legacy_forward_until` gelecekte, UTC ve en fazla 30 gun (tercihen 14 gun veya daha kisa) olmalidir.
2. Workflow ozetinde deployment ID, route ID/pattern, D1 migration, deadline, `MALFORMED_CALLBACK` smoke sonucu ve rollback workflow adini kaydet.
   Secret senkronu yarida kalirsa Worker henuz route edilmemistir; hatayi duzeltip ayni workflow'u yeniden calistir. Route'u elle baglama.
3. GitHub Actions disinda tek kullanimlik test degerlerini olustur:

```powershell
cd backend
npm run transition:challenge:create
```

4. AdMob SSV ekraninda su alanlari kullan:

```text
Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
User ID: transition:challenge:create ciktisindaki User ID
Custom data: transition:challenge:create ciktisindaki challenge UUID
```

5. **URL'yi doğrula** butonuna bas. Basarisizsa kaydetme. Basariliysa **Doğrulanan URL'yi kullan**, ardindan **Kaydet**.
6. Challenge'i kontrol et; kayda yalnizca challenge prefix, expiry, `verified` status ve transaction prefix ekle:

```powershell
npm run transition:challenge:inspect -- <challenge-uuid>
```

7. Evidence kaydindan sonra test satirini sil:

```powershell
npm run transition:challenge:delete -- <challenge-uuid>
```

8. `android-internal-preflight` calistir ve workflow URL/sonucunu kaydet. `ENABLE_PRODUCTION_RELEASE=false` kalmalidir.

### Gecis rollback

`backend-ssv-transition-rollback` workflow'unu `REMOVE_TRANSITION_ROUTE` onayi ile calistir. Workflow yalnizca exact reward route'unu siler, origin health'i `200`, eski SSV fall-through davranisini `403` olarak dogrular ve D1 migration'ini silmez. Worker silme secenegi route kaldirildiktan ve origin dogrulandiktan sonra kullanilabilir.

## Backend Deploy Adimlari

`backend-production-deploy` tam backend cutover isidir ve gecis asamasinda calistirilmaz. Rewarded SSV panel dogrulamasi ve internal QA tamamlanmadan eski client uyumlulugunu kaldirma.

1. Doppler secret'larinin guncel oldugunu kontrol et.
2. Lokal on dogrulama calistir:

```powershell
cd backend
npm ci
npm run types:generate
npm run build
npm test
npm run test:runtime
```

3. Tercih edilen production deploy yolu GitHub Actions'taki `backend-production-deploy` workflow'udur. Workflow'u `main` branch uzerinde manuel calistir ve onay alanina `DEPLOY` yaz.
4. Workflow; build, unit test, runtime smoke test, Doppler secret dogrulamasi, Worker secret senkronizasyonu, deploy ve canli endpoint kontrollerini sirayla calistirir.
5. Acil lokal deploy gerekirse:

```powershell
cd backend
npm run deploy:doppler
```

6. Deploy sonrasi Worker versiyonunu ve Git SHA'yi not et.

## Icerik Backfill Adimlari

Deploy sonrasi ya da takvim ilerlediginde future content eksigi varsa:

```powershell
cd backend
$env:SEED_DATE='2026-03-26'
$env:SEED_DAILY_DAYS='14'
$env:SEED_SKIP_STATIC_CONTENT='true'
npm run seed
```

GitHub Actions uzerinden alternatif:

- Zamanlanmis calisma icin `ENABLE_CONTENT_BACKFILL=true` repo variable'ini ayarla; secret hazir degilse bayragi kapali tut
- `content-backfill` workflow'unu manuel tetikle
- Gerekirse `seed_date` ve `daily_days` input'larini doldur
- Workflow, deploy edilmis backend'deki `POST /api/v1/admin/content/backfill` endpoint'ini
  `x-admin-secret` ile tetikler; ayrica `CLOUDFLARE_API_TOKEN` gerekmez.

## Smoke Check

### Backend

1. `GET https://astrology.parsfilo.com/api/v1/health` -> `200`
2. `register` ve `users/me` zinciri -> `200`
3. `content/personality` -> `200`
4. `content/compat` -> `200`
5. En az bir gelecek tarihli `content/daily` -> `200`

### Android

1. Uygulama acilisinda crash olmamali.
2. Home ekranindan Daily ekranina gecis calismali.
3. Manual refresh stale cache'i asarak yeni veri istemeli.
4. Premium ekranina navigation calismali.
5. Internal track artifact'i Play Console icinde gorunmeli.

## Rollback

### Android

1. Play Console uzerinden staged rollout'u durdur ya da son saglam release'e don.
2. Gerekirse `android-production-release` yerine once internal track promotion stratejisine geri don.

### Backend

1. Son saglam Worker deploy versiyonunu belirle.
2. Gerekirse onceki release commit'ine donup yeniden `npm run deploy:doppler` calistir.
3. Secret seti release ile uyumlu kalmali; eski config'e donerken secret drift kontrolu yap.

## Operasyon Sonrasi Kayit

Her release sonunda su bilgiler saklanmali:

- Release tag
- Git commit SHA
- Cloudflare Worker deploy ID
- Transition route ID ve `astrology.parsfilo.com/api/v1/rewards/*` pattern
- Legacy compatibility deadline
- D1 migration ve malformed callback 400 sonucu
- AdMob test challenge prefix/expiry/verified status/transaction prefix
- Test challenge silme sonucu
- Android internal preflight workflow URL/sonucu
- Android artifact/build numarasi
- GitHub workflow run URL'si
- Smoke check sonucu
- Geri alma gerekiyorsa rollback nedeni
