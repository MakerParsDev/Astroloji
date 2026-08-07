package com.parsfilo.astrology.store

internal data class StoreMarketingCopy(
    val headline: String,
    val supportingText: String,
)

internal data class StoreLocalizedCopy(
    val daily: StoreMarketingCopy,
    val weekly: StoreMarketingCopy,
    val monthly: StoreMarketingCopy,
    val compatibility: StoreMarketingCopy,
    val profile: StoreMarketingCopy,
    val premium: StoreMarketingCopy,
)

internal val englishStoreCopy =
    StoreLocalizedCopy(
        daily =
            StoreMarketingCopy(
                headline = "See today's horoscope at a glance",
                supportingText = "Personalized daily guidance for your sign.",
            ),
        weekly =
            StoreMarketingCopy(
                headline = "See the rhythm of your week ahead",
                supportingText = "Follow the week's themes and strongest day.",
            ),
        monthly =
            StoreMarketingCopy(
                headline = "Explore the bigger picture this month",
                supportingText = "See the month's themes in one clear view.",
            ),
        compatibility =
            StoreMarketingCopy(
                headline = "Compare zodiac compatibility clearly",
                supportingText = "Compare love, friendship, and work scores.",
            ),
        profile =
            StoreMarketingCopy(
                headline = "Personalize your zodiac profile",
                supportingText = "Manage your sign, language, theme, and preferences.",
            ),
        premium =
            StoreMarketingCopy(
                headline = "Choose monthly or weekly Premium",
                supportingText = "Compare monthly and weekly options before choosing.",
            ),
    )

internal val turkishStoreCopy =
    StoreLocalizedCopy(
        daily =
            StoreMarketingCopy(
                headline = "Bugünün burç yorumunu tek bakışta gör",
                supportingText = "Burcuna özel günlük rehberini hızlıca incele.",
            ),
        weekly =
            StoreMarketingCopy(
                headline = "Haftanın ritmini önceden yakala",
                supportingText = "Haftanın temalarını ve güçlü gününü takip et.",
            ),
        monthly =
            StoreMarketingCopy(
                headline = "Ayın büyük resmini keşfet",
                supportingText = "Ayın temalarını tek bir net görünümde keşfet.",
            ),
        compatibility =
            StoreMarketingCopy(
                headline = "Burç uyumunu net puanlarla karşılaştır",
                supportingText = "Burçları aşk, arkadaşlık ve iş puanlarıyla karşılaştır.",
            ),
        profile =
            StoreMarketingCopy(
                headline = "Burç profilini kişiselleştir",
                supportingText = "Burç, dil, tema ve tercihlerini tek yerde yönet.",
            ),
        premium =
            StoreMarketingCopy(
                headline = "Aylık veya haftalık Premium seç",
                supportingText = "Aylık ve haftalık seçenekleri yan yana karşılaştır.",
            ),
    )
