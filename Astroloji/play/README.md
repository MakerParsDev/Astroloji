# Play metadata source of truth

Bu klasor Google Play store listing ve release notes dosyalarinin repo icindeki canonical kaynagidir.

## Yapi

- `listings/<locale>/title.txt`
- `listings/<locale>/short-description.txt`
- `listings/<locale>/full-description.txt`
- `release-notes/<locale>/default.txt`

## Kurallar

1. Baslik 30 karakteri gecmemeli.
2. Kisa aciklama 80 karakteri gecmemeli.
3. Tam aciklama 4000 karakteri gecmemeli.
4. Keyword stuffing, asiri `|` ayiricisi ve politika riski tasiyan marka/app referanslari kullanma.
5. Metadata degisikligini binary release ile ayni PR'a koymak zorunda degilsin; `android-metadata` workflow'u bunu ayri yonetir.

## Workflow kullanimi

- `android-metadata` push'ta dogrulama yapar.
- Ayni workflow manuel tetiklenirse Play edit olusturup metadata'yi yukler.
- Varsayilan olarak degisiklikler Play tarafindan otomatik incelemeye gonderilir; yalniz desteklenen hesaplarda `PLAY_CHANGES_NOT_SENT_FOR_REVIEW=true` ile bekletme istenebilir.
