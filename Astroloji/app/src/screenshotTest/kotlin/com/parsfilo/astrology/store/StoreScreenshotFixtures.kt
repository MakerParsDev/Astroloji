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

internal val spanishStoreCopy =
    StoreLocalizedCopy(
        daily =
            StoreMarketingCopy(
                headline = "Mira tu horóscopo de hoy de un vistazo",
                supportingText = "Guía diaria personalizada para tu signo.",
            ),
        weekly =
            StoreMarketingCopy(
                headline = "Descubre el ritmo de tu semana",
                supportingText = "Sigue los temas de la semana y tu día más fuerte.",
            ),
        monthly =
            StoreMarketingCopy(
                headline = "Explora el panorama completo del mes",
                supportingText = "Ve los temas del mes en una vista clara.",
            ),
        compatibility =
            StoreMarketingCopy(
                headline = "Compara la compatibilidad zodiacal",
                supportingText = "Compara puntuaciones de amor, amistad y trabajo.",
            ),
        profile =
            StoreMarketingCopy(
                headline = "Personaliza tu perfil zodiacal",
                supportingText = "Gestiona tu signo, idioma, tema y preferencias.",
            ),
        premium =
            StoreMarketingCopy(
                headline = "Elige Premium mensual o semanal",
                supportingText = "Compara las opciones mensual y semanal antes de elegir.",
            ),
    )

internal val portugueseStoreCopy =
    StoreLocalizedCopy(
        daily =
            StoreMarketingCopy(
                headline = "Veja seu horóscopo de hoje rapidamente",
                supportingText = "Orientação diária personalizada para o seu signo.",
            ),
        weekly =
            StoreMarketingCopy(
                headline = "Descubra o ritmo da sua semana",
                supportingText = "Acompanhe os temas da semana e seu dia mais forte.",
            ),
        monthly =
            StoreMarketingCopy(
                headline = "Explore o panorama completo do mês",
                supportingText = "Veja os temas do mês em uma visão clara.",
            ),
        compatibility =
            StoreMarketingCopy(
                headline = "Compare a compatibilidade zodiacal",
                supportingText = "Compare pontuações de amor, amizade e trabalho.",
            ),
        profile =
            StoreMarketingCopy(
                headline = "Personalize seu perfil zodiacal",
                supportingText = "Gerencie seu signo, idioma, tema e preferências.",
            ),
        premium =
            StoreMarketingCopy(
                headline = "Escolha o Premium mensal ou semanal",
                supportingText = "Compare as opções mensal e semanal antes de escolher.",
            ),
    )

internal val germanStoreCopy =
    StoreLocalizedCopy(
        daily =
            StoreMarketingCopy(
                headline = "Ihr heutiges Horoskop auf einen Blick",
                supportingText = "Persönliche tägliche Orientierung für Ihr Sternzeichen.",
            ),
        weekly =
            StoreMarketingCopy(
                headline = "Entdecken Sie den Rhythmus Ihrer Woche",
                supportingText = "Verfolgen Sie die Themen der Woche und Ihren stärksten Tag.",
            ),
        monthly =
            StoreMarketingCopy(
                headline = "Entdecken Sie das große Ganze in diesem Monat",
                supportingText = "Sehen Sie die Themen des Monats auf einen Blick.",
            ),
        compatibility =
            StoreMarketingCopy(
                headline = "Vergleichen Sie die Sternzeichen-Kompatibilität",
                supportingText = "Vergleichen Sie Werte für Liebe, Freundschaft und Beruf.",
            ),
        profile =
            StoreMarketingCopy(
                headline = "Personalisieren Sie Ihr Sternzeichen-Profil",
                supportingText = "Verwalten Sie Zeichen, Sprache, Design und Einstellungen.",
            ),
        premium =
            StoreMarketingCopy(
                headline = "Wählen Sie monatliches oder wöchentliches Premium",
                supportingText = "Vergleichen Sie monatliche und wöchentliche Optionen vor der Wahl.",
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
