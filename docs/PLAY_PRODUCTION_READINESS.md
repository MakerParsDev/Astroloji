# Google Play Production Readiness

Last reviewed: 2026-07-27

## Automated gates

- `main` CI must pass backend build/tests/runtime, Android Detekt/ktlint/unit tests, debug APK, and release AAB dry-run.
- `backend-ssv-transition-deploy` must build the route-free Worker, apply the D1 migration, sync only transition secrets, attach the exact reward route, and pass live isolation checks.
- `backend-ssv-transition-rollback` must remove only the exact route before any optional Worker deletion.
- `android-internal-preflight` must validate Doppler release secrets, Firebase package identity, the Play service account, Play version codes, upload keystore credentials, production AdMob ID formats, live rewarded SSV, and the signed AAB.
- `android-internal-release` must pass the same live rewarded SSV gate before uploading.
- Production and metadata deployments use the `production` GitHub environment and must originate from `main`.

## Required rewarded SSV transition order

Guvenli operator sirasi: `create -> AdMob -> inspect verified -> delete`.

1. Merge edilen transition Worker degisikligi icin `main` CI ve guvenlik kontrollerinin yesil oldugunu dogrulayin.
2. Gerekliyse `backend-ssv-transition-deploy` workflow'unu `main` uzerinden `DEPLOY_TRANSITION` onayi ve en fazla 30 gun ileride UTC deadline ile calistirin.
3. Canli callback `400 / MALFORMED_CALLBACK` donmeli; route ID, deployment ID, D1 migration ve rollback evidence kaydedilmelidir.
4. Repo kokundeki `tools/admob-ssv-verification-values.html` dosyasini yerel tarayicida acin. Yeni degerler uretin ve sayfayi test tamamlanana kadar acik tutun.
5. Uretilen degerleri gecici repository Actions secrets olarak kaydedin:
   - `ADMOB_SSV_TEST_USER_ID`
   - `ADMOB_SSV_TEST_CUSTOM_DATA`
6. `backend-admob-ssv-verification-challenge` workflow'unu command `create` ve confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistirin. Workflow exact `admob-verify-*` gecici D1 kullanicisini otomatik olusturur; ozet yalnizca redakte prefix, `pending` status ve expiry gostermelidir.
7. Production rewarded ad unit SSV ekraninda tam olarak sunlari girin:

   ```text
   Callback URL: https://astrology.parsfilo.com/api/v1/rewards/ssv
   User ID: yerel generator sayfasinda gorunen User ID
   Custom data: yerel generator sayfasinda gorunen Custom data
   ```

8. **URL'yi doğrula** basarili olduktan sonra **Doğrulanan URL'yi kullan** ve **Kaydet** secin. Basarisiz dogrulamayi kaydetmeyin.
9. Ayni workflow'u command `inspect`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistirin; status `verified` ve transaction prefix zorunludur.
10. Evidence kaydindan sonra workflow'u command `delete`, confirm `MANAGE_ADMOB_SSV_CHALLENGE` ile calistirin; D1 challenge satiri ve artik kullanilmayan gecici D1 kullanicisi otomatik silinmelidir. Sonra repository Actions settings ekranindan `ADMOB_SSV_TEST_USER_ID` ve `ADMOB_SSV_TEST_CUSTOM_DATA` secret'larini manuel silin.
11. `android-internal-preflight` calistirin ve gercek cihazda daily/weekly rewarded QA tamamlayin. `ENABLE_PRODUCTION_RELEASE=false` kalmalidir.

## Transition rollback

Run `backend-ssv-transition-rollback` with confirmation `REMOVE_TRANSITION_ROUTE`. It removes only the exact reward route, verifies origin health, confirms the SSV path falls back to the unchanged origin, and leaves the additive D1 migration intact. Worker deletion is optional and occurs only after route removal and origin verification.

## Manual Play Console checks

- Data safety declarations match Firebase, Crashlytics, analytics, advertising identifiers, notifications, subscriptions, and backend account data.
- Account deletion is declared as supported and links to `https://astrology.parsfilo.com/delete-account`.
- Ads declaration, content rating, target audience, app access, privacy policy, and subscription/product declarations are current.
- Store screenshots, feature graphic, icon, Turkish/English text, support contact, and release notes are current.
- The public Play page must show account deletion is supported and link to `https://astrology.parsfilo.com/delete-account`; verify this after the Console save and review approval.
- Keep `ENABLE_PRODUCTION_RELEASE=false` until all manual checks and internal QA are complete.
- Production release `1102` is currently completed at 100% (`1.0`). Policy/listing work must not mutate that track. A future/staged release may use a 10% cap only after policy, visual, crash/ANR, and conversion evidence is reviewed in a separate rollout decision.

## Rollback

- Android: halt rollout or return to the last healthy Play release.
- Transition: run `backend-ssv-transition-rollback`; the unchanged origin resumes reward traffic immediately and the additive D1 table remains.
- Full backend: do not redeploy or roll back `astrology-backend` as part of transition rollback.
- Keep rewarded unlock fail-closed; do not restore the former client-only claim path during rollback.
