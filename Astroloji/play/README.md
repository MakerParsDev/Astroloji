# Play metadata source of truth

Bu klasör Google Play mağaza metinleri, sürüm notları ve global yayın yapılandırmasının repo içindeki canonical kaynağıdır.

## Desteklenen diller

`store-config.json`, Android uygulamasının `locales_config.xml` dosyasıyla birebir eşleşen mağaza dillerini tanımlar. İlk global kalite aşamasında yalnızca:

- `en-US`
- `tr-TR`

desteklenir. Android uygulamasında bulunmayan bir dil için Play listing yayımlanamaz.

## Yapı

- `store-config.json`
- `listings/<locale>/title.txt`
- `listings/<locale>/short-description.txt`
- `listings/<locale>/full-description.txt`
- `release-notes/<locale>/default.txt`

## Kurallar

1. Başlık 30 karakteri geçmemeli.
2. Kısa açıklama 80 karakteri geçmemeli.
3. Tam açıklama 4000 karakteri geçmemeli.
4. Keyword stuffing, aşırı `|` ayırıcısı ve politika riski taşıyan marka/app referansları kullanılmamalı.
5. Play locale listesi Android uygulama locale listesiyle birebir eşleşmeli.
6. Metadata değişikliği binary release ile aynı PR içinde olmak zorunda değildir; `android-metadata` workflow’u ayrı yönetir.
7. Canlı yayın; backup, dry-run, açık diff ve bağımsız read-back olmadan yapılmaz.

## Workflow kullanımı

- `android-metadata` push sırasında doğrulama yapar.
- Manuel yayın işlemi yalnız güvenlik kapısı açıkken çalışır.
- Production rollout oranı metadata yayını tarafından değiştirilmez.

## Güvenli canlı operasyon gereksinimleri

`android-metadata` workflow'unda `publish`, `cleanup` ve `restore` modları yalnız `main`, `production` environment onayı, `ENABLE_METADATA_PUBLISH=true`, immutable backup girdileri ve exact confirmation ile çalışır. Shell komutları `workflow_dispatch` girdilerini doğrudan template interpolation ile kullanmaz; girdiler önce environment değişkenlerine bağlanır.

Mutation sonrası `ENABLE_METADATA_PUBLISH` kapısının gerçekten `false` durumuna döndüğünü okumak için repository secret olarak **`METADATA_VARIABLES_READ_TOKEN`** gerekir. Bu token yalnız ilgili repository Actions-variable değerini okuyabilecek minimum fine-grained yetkiye sahip olmalıdır; içerik yazma, release yazma veya Play yetkisi verilmemelidir. Token yoksa final gate-check job fail-closed davranır.

Yeni Play backup şeması canonical `defaultLocale` değerini (`tr-TR`) açıkça kaydeder. `defaultLocale` veya doğrulanabilir SHA-256 bilgisi taşımayan eski backup dosyaları tarihsel kanıt olarak tutulabilir ancak guarded restore apply için kullanılmaz; restore öncesi yeni backup alınır.

Canlı production release `1102` şu anda `completed` / `1.0` (100%) olarak okunmaktadır. `store-config.json` içindeki `0.1` değeri metadata yayın güvenlik sözleşmesidir; metadata araçları production rollout'u değiştirmez ve bu drift çözülmeden publish/cleanup mutasyonu açmaz.
