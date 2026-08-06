Sen ileri seviye bir yazılım mühendisisin.

CALISMA PRENSIPLERI

1. Windows ortaminda PowerShell ile calis.
2. Kod degisikliginden once mevcut dokumantasyon ve bu dosyayi oku.
3. Yeni kutuphane eklemeden once surum pinini ve gerekcesini bu dosyada guncelle.
4. Her davranis degisikliginde once test yaz, sonra minimum kodla gecer hale getir.
5. Her patch turundan sonra ilgili testleri calistir; genel dogrulamada tum build/test zincirini kos.
6. Secret ve release artefact dosyalarini repoda tutma; ornek dosya + lokal secret store kullan.

## Onayli Bagimliliklar
| Paket | Versiyon | Neden |
| ----- | -------- | ----- |
| Android Gradle Plugin | 9.3.1 | Android Developers AGP release notes kontrol edildi; repo bu pin ile lint, screenshot, unit, debug APK ve release AAB dogruladi. |
| Kotlin + Compose Compiler plugin | 2.4.10 | Kotlin release kanali incelendi; repo pin'i mevcut Compose/Hilt/KSP akisi ile calisiyor. |
| KSP | 2.3.7 | Kotlin pin'i ile uyumlu repo pin'i korunuyor; kod uretimi lokal build'de dogrulandi. |
| AndroidX Core / AppCompat / Activity / Lifecycle | 1.19.0 / 1.7.1 / 1.13.0 / 2.11.0 | AndroidX resmi release notlari kontrol edildi; mevcut pinler unit test ve debug compile ile gecerli. |
| Jetpack Compose BOM | 2026.06.01 | Compose BOM ailesi Android Developers kanalina gore izlendi; repo pin'i mevcut UI ve test setiyle uyumlu. |
| Navigation Compose | 2.9.8 | AndroidX navigation release notlari kontrol edildi; mevcut navigation graph'i ile stabil calisiyor. |
| Room | 2.8.4 | AndroidX Room release notlari kontrol edildi; migration ve DAO katmani bu pin ile dogrulandi. |
| DataStore | 1.2.1 | AndroidX DataStore stable kanali referans alindi; preferences tabanli session akisi bu surumle sorunsuz. |
| Hilt / AndroidX Hilt | 2.60.1 / 1.4.0 | Dagger Hilt ve AndroidX Hilt entegrasyonu mevcut DI + WorkManager zinciriyle dogrulandi. |
| WorkManager / Glance | 2.11.2 / 1.1.1 | Background work ve widget katmani resmi stable aileleriyle uyumlu, lokal build'de gecerli. |
| Firebase Android BoM + plugins | 34.16.0 / 4.5.0 / 3.0.7 | Firebase release notlari ve plugin kanali kontrol edildi; Auth, Messaging, Crashlytics ve Remote Config akislariyla birlikte calisiyor. |
| Google Mobile Ads / App Set / UMP / Play Billing | 25.4.0 / 16.1.0 / 4.0.0 / 9.1.0 | Google resmi release sayfalari incelendi; reklam ve subscription akisi bu pinlerle hizali. Play Billing 9.x major API degisikligi dogrulandi. |
| OkHttp / Retrofit / kotlinx.serialization / Coroutines | 5.4.0 / 3.0.0 / 1.11.0 / 1.11.0 | Network katmani ve coroutine tabanli repository akislari lokal testte dogrulandi. |
| Coil / Lottie / Timber | 3.5.0 / 6.7.1 / 5.0.1 | UI medya/logging katmani icin mevcut pinler korunuyor; yeni kutuphane eklenmedi. |
| Detekt / ktlint Gradle / Play Publisher | 1.23.8 / 14.2.0 / 4.0.0 | Statik analiz ve release otomasyonu icin resmi plugin sayfalari kontrol edildi; gorevler lokal olarak tanimli. |
| JUnit / MockK / Turbine / Truth / Robolectric | 4.13.2 / 1.14.11 / 1.2.1 / 1.4.5 / 4.16.1 | Android unit test zinciri bu kombinasyonla gecerli. |
| Hono / jose / zod | 4.13.0 / 6.1.0 / 4.1.5 | Backend runtime kutuphaneleri exact pin ile tutulur; Hono 4.13.0 CORS ReDoS guvenlik duzeltmesini icerir ve mevcut Worker davranisi ile dogrulanir. |
| TypeScript / tsx / Vitest | 5.9.2 / 4.20.5 / 3.2.7 | Backend build, node test lane ve Workers runtime smoke lane bu kombinasyonla yesil. |
| Wrangler / generated runtime types | 4.118.0 / worker-configuration.d.ts | Cloudflare Workers araci latest exact pin ile tutulur; generated binding types, compatibility date, dry-run ve runtime smoke testleriyle dogrulanir. |
| picomatch (override) | 4.0.4 | GitHub Dependabot GHSA-3v7f-55p6-f55p uyarisi icin transitif override ile guvenli yama surumu sabitlendi. |
| postcss / undici (overrides) | 8.5.23 / 7.29.0 | Vite ve Miniflare transitif pinleri upstream yamayi beklerken npm audit bulgularini kapatmak icin ayni major icindeki guvenli surumler sabitlendi. |

Not: 2026-08-05 tarihinde npm audit ve paket manifestleri kontrol edildi. Mevcut pinler lokal build/test ile dogrulanan calisan baz cizgi olarak korundu.

