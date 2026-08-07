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
