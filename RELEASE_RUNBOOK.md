# Release Runbook

Bu dokuman `v1.0.0` ve sonraki release'ler icin production operasyon runbook'udur. Yayinlar yalnizca onayli GitHub Actions workflow_dispatch ile main uzerinden baslatilir.

## Kapsam

- Android uygulama release hazirligi
- Cloudflare Worker backend deploy adimlari
- Deploy sonrasi smoke check
- Rollback proseduru

## Manuel Kontrollu Yayin Akisi

1. main commit'i icin CI testlerini ve kod guvenligi kontrollerini dogrula.
2. Backend degistiyse backend-production-deploy workflow'unu main ve DEPLOY onayiyla baslat. D1 pending migration politikasi, main SHA, canli health ve rollback denetimleri korunur.
3. Android release icin once android-internal-preflight, sonra android-internal-release workflow'unu RELEASE_INTERNAL onayiyla calistir; gercek cihazda kabul testlerini tamamla.
4. Google Play production icin android-production-release workflow'unu main uzerinden manuel baslat. Staged rollout ve ilerleme karari Play/Crashlytics verileriyle insan tarafindan verilir; otomatik terfi yoktur.
5. Store metadatasi android-metadata workflow'u ile backup, diff, onayli publish ve readback asamalarindan gecirilir.
6. content-backfill yalniz ENABLE_CONTENT_BACKFILL=true ise gunluk calisir; manuel dispatch ayrica kullanilabilir. Bu islem urunun burc icerigine aittir, ajan orkestrasyonu degildir.

production ve internal GitHub environment denetimleri, Doppler secret kaynagi ve geriye donus adimlari korunur.

## Preflight Checklist

Release almadan once su maddeler `PASS` olmali:

1. `main` branch temiz olmali.
2. Son GitHub Actions `ci` kosusu yesil olmali.
3. GitHub security alerts acik olmamali.
4. Android icin gerekli GitHub environment secret'lari hazir olmali.
5. Backend icin Doppler ve Cloudflare secret'lari guncel olmali.
6. R2 burc icerigi, mevcut hafta/ay ile bugun dahil en az 7 gunluk gunluk icerigi tum desteklenen diller icin kapsiyor olmali.
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
- `ADMOB_REWARDED_ID`
- `CLOUDFLARE_API_TOKEN`
- Scoped admin credentials generic backend secret setine dahil degildir. `ADMIN_CONTENT_SECRET`, `ADMIN_NOTIFICATION_SECRET`, `ADMIN_PLAY_READ_SECRET`, `ADMIN_PLAY_WRITE_SECRET` ayri `production-admin-*` environment'larinda tutulur.

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

3. android-internal-release yalniz main uzerindeki manuel RELEASE_INTERNAL dispatch ile calisir; production promotion ancak ayrica manuel tetiklenir.
4. Staged rollout oranini ilerletme veya durdurma karari canli vitals ve Play verilerine gore manuel verilir.
5. Varsayilan staged rollout `%10`'dur; break-glass dispatch'te gerekli ise workflow input'u ile override edilebilir.
6. Google Play metadata degisiklikleri icin `android-metadata` workflow'unu `main` dalinda manuel kullan: validate/backup/diff, sonra gereken onay ve readback. Push tetikleyicisi yalnizca metadata dogrulamasi yapar.
7. Release artifact'i repoya commit etme; GitHub artifact olarak saklanir.
8. Doppler modeli kullaniliyorsa `internal` ve `production` environment icin ayri read-only token tercih et.

## Rewarded SSV Gecis Worker'i

Bu gecis tam `astrology-backend` deploy'u degildir. Sadece exact reward route transition Worker'a gider; diger yollar degismemis origin Worker'da kalir.

Guvenli operator sirasi: `create -> AdMob -> inspect verified -> delete`.

1. `main` uzerinde `backend-ssv-transition-deploy` workflow'unu gerekiyorsa `DEPLOY_TRANSITION` onayi ve gelecekte UTC deadline ile calistir.
2. Workflow ozetinde deployment ID, route ID/pattern, D1 migration, deadline ve `MALFORMED_CALLBACK` sonucunu kaydet.
3. Repo kokundeki `tools/admob-ssv-verification-values.html` dosyasini yerel tarayicida ac, yeni degerler uret ve sayfayi acik tut.
4. Degerleri gecici repository Actions secrets olarak kaydet:
   - `ADMOB_SSV_TEST_USER_ID`
   - `ADMOB_SSV_TEST_CUSTOM_DATA`
5. `backend-admob-ssv-verification-challenge` workflow'unu command `create`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistir. Workflow exact `admob-verify-*` gecici D1 kullanicisini otomatik olusturur; ozet yalnızca redakte prefix, `pending` status ve expiry icermelidir.
6. AdMob SSV ekraninda su alanlari kullan:

```text
Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
User ID: acik yerel generator sayfasindaki User ID
Custom data: acik yerel generator sayfasindaki Custom data
```

7. **URL'yi doğrula** basarisizsa kaydetme. Basariliysa **Doğrulanan URL'yi kullan**, ardindan **Kaydet**.
8. Workflow'u command `inspect`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistir; redakte evidence status `verified` ve transaction prefix gostermelidir.
9. Workflow'u command `delete`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistir; exact D1 challenge satiri ve artik kullanilmayan gecici D1 kullanicisi otomatik silinmelidir. Ardindan repository Actions settings ekranindan `ADMOB_SSV_TEST_USER_ID` ve `ADMOB_SSV_TEST_CUSTOM_DATA` secret'larini manuel sil.
10. `android-internal-preflight` calistir ve workflow URL/sonucunu kaydet. `ENABLE_PRODUCTION_RELEASE=false` kalmalidir.

### Gecis rollback

`backend-ssv-transition-rollback` workflow'unu `REMOVE_TRANSITION_ROUTE` onayi ile calistir. Workflow yalnizca exact reward route'unu siler, origin health'i `200`, eski SSV fall-through davranisini `403` olarak dogrular ve D1 migration'ini silmez. Worker silme secenegi route kaldirildiktan ve origin dogrulandiktan sonra kullanilabilir.

## Scoped Admin Credential Operasyonu

Admin yetkileri dort capability'ye ayridir: `content-ops`, `notification-ops`, `play-read`, `play-write`. Her capability yalniz kendi `production-admin-*` GitHub environment secret'ini kullanir. Generic `backend-production-deploy` bu credential'lari okumaz, yazmaz veya Cloudflare'a yeniden senkronlamaz.

Rotasyon veya acil revocation icin yalniz ilgili environment credential'ini guncelle, sonra `backend-admin-capability-sync` workflow'unu `SYNC_ADMIN_CAPABILITY` onayi ve exact capability secimiyle calistir. Workflow kendi endpoint'inde non-destructive expected status'u ve diger capability boundary'lerinde `403/FORBIDDEN` izolasyonunu dogrular. Bir capability rotasyonu diger uc credential'i degistirmemelidir.

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

3. Production backend deploy yalniz main uzerinde backend-production-deploy workflow_dispatch ve DEPLOY onayiyla baslatilir.
4. Workflow; build, unit test, runtime smoke test, Doppler secret dogrulamasi, Worker secret senkronizasyonu, deploy ve canli endpoint kontrollerini sirayla calistirir.
5. Acil deploy durumunda da `backend-production-deploy` workflow'unu `main` uzerinden `DEPLOY` onayiyla manuel calistir. Workflow exact `main` SHA, environment ve Doppler denetimlerini atlamaz.
6. Deploy sonrasi Worker versiyonunu ve Git SHA'yi not et.

## Icerik Backfill Adimlari

Bu, urunun kendi burc icerigi bakimidir; agent veya otonom release controller degildir.

1. GitHub main CI yesil olmali. Degisen backend kodunu **once** mevcut `backend-production-deploy` manuel is akisi ve `DEPLOY` onayi ile yayinla; Play/Android yayinina dokunma.
2. `production-admin-content` ortami credential'i ile yeni salt okunur `GET /api/v1/admin/content/backfill/capabilities` endpoint'inin `deterministic_default=true`, `skip_existing_supported=true`, `max_product_horizon_days=7` dondurdugunu dogrula. `content-backfill` workflow'u da ayni kontrolu fail-closed yapar; eski Worker'a backfill cagrisi gondermez.
3. `content-backfill` workflow'unu main'de manuel dispatch et. `daily_days=7`, `language=all` (veya tek dil), `seed_date` bos (bugun) olarak kullan. Zamanlanmis calisma sadece `ENABLE_CONTENT_BACKFILL=true` ile etkinlestirilir.
4. Is akisi her dili ayri istekle isler, sadece eksik R2 tarih belgelerini yazar (`skip_existing=true`), kisilik/uyum belgelerini degistirmez ve **Workers AI cagirmaz** (`enhance_with_ai=false`). Mevcut onayli icerik korunur. Run URL ve editoryal onay metadata'si kaydedilir.
5. R2'de su key'lerin varligini ve tarih metadata'sini kontrol et: `content/daily/{lang}/{YYYY-MM-DD}.json`, `content/weekly/{lang}/{YYYY-Www}.json`, `content/monthly/{lang}/{YYYY-MM}.json`. Desteklenen diller `tr/en/es/pt/de/fr`'dir. D1 sema, Android release ve reklam ayarlari degismemelidir.
6. Uygulamada gunluk/haftalik/aylik yorumlari, premium gecislerini ve Turkce hata mesajlarini gercek cihaz veya emulatorde kabul testine sok. Gerekiyorsa ayri uygulama PR'i ac.
7. Ilk backfill ve canli okumalar PASS olmadan `ENABLE_CONTENT_BACKFILL` degiskenini acma. Acildiktan sonra ertesi gunun zamanlanmis isini ve basarisizlik uyarilarini dogrula.

`npm run seed` komutunu production kurtarma yolu olarak calistirma; environment onayini atlar. Urune dahil olmayan otomasyon/ajan sistemlerini geri getirme.


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

1. Son saglam Worker deploy versiyonunu ve gerekli kod degisikliklerini belirle; D1 sema degisikliklerinin geriye alinabilir oldugunu varsayma.
2. Saglam release davranisini yeniden getiren bir rollback commit'ini `main` dalina al. Onceki release SHA'sini dogrudan deploy girdisi olarak kullanma; workflow yalnizca guncel `main` SHA'sini kabul eder.
3. `backend-production-deploy` workflow'unu `main` uzerinden `workflow_dispatch` ile baslat; `release_sha` icin rollback commit SHA'sini ve `confirm` icin `DEPLOY` degerini kullan. CI, environment, migration ve canli smoke kontrollerini koru.
4. Secret seti release ile uyumlu kalmali; eski config'e donerken secret drift kontrolu yap.

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
