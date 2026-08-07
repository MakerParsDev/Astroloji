package com.parsfilo.astrology.store

import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.feature.premium.PremiumOfferCallbacks
import com.parsfilo.astrology.feature.premium.PremiumUiState

internal enum class StoreLocale {
    ENGLISH,
    TURKISH,
}

internal data class StoreLocalizedCopy(
    val signName: String,
    val todayLabel: String,
    val dailyHeadline: String,
    val dailyBody: String,
    val dailyCardTitle: String,
    val energyLabel: String,
    val loveLabel: String,
    val workLabel: String,
    val dailyAdvice: String,
    val guidanceHeadline: String,
    val weeklyTitle: String,
    val weeklyBody: String,
    val bestDayLabel: String,
    val monthlyTitle: String,
    val monthlyBody: String,
    val monthlyThemeLabels: List<String>,
    val compatibilityHeadline: String,
    val compatibilityBody: String,
    val compatibilityPairLabel: String,
    val friendshipLabel: String,
    val personalityHeadline: String,
    val personalityBody: String,
    val elementPlanetLabel: String,
    val strengthsTitle: String,
    val strengths: List<String>,
    val deeperInsightTitle: String,
    val deeperInsightBody: String,
    val toolsHeadline: String,
    val toolsBody: String,
    val widgetLabel: String,
    val notificationLabel: String,
    val shareLabel: String,
    val todayScoreLabel: String,
    val premiumHeadline: String,
    val premiumBody: String,
    val monthlyPlanTitle: String,
    val weeklyPlanTitle: String,
)

internal val englishStoreCopy =
    StoreLocalizedCopy(
        signName = "Aries",
        todayLabel = "Today",
        dailyHeadline = "Your daily horoscope, at a glance",
        dailyBody = "Start the day with a personalized energy overview and clear guidance for love, work, money, and wellbeing.",
        dailyCardTitle = "A confident start",
        energyLabel = "Energy",
        loveLabel = "Love",
        workLabel = "Work",
        dailyAdvice = "Take one clear step toward the conversation or project that matters most today.",
        guidanceHeadline = "See the week and month ahead",
        weeklyTitle = "Weekly guidance",
        weeklyBody = "Focus your attention with a practical overview of the week, its strongest day, and key themes.",
        bestDayLabel = "Best day · Thursday",
        monthlyTitle = "Monthly perspective",
        monthlyBody = "Explore the bigger picture with monthly themes for relationships, career, and personal growth.",
        monthlyThemeLabels = listOf("Love", "Work", "Growth"),
        compatibilityHeadline = "Understand zodiac compatibility",
        compatibilityBody = "Compare love, friendship, and work dynamics with clear scores and balanced insights.",
        compatibilityPairLabel = "Aries + Leo",
        friendshipLabel = "Friendship",
        personalityHeadline = "Discover your zodiac personality",
        personalityBody = "Explore strengths, ideal connections, and deeper sign-based insights in a polished profile.",
        elementPlanetLabel = "Fire · Mars",
        strengthsTitle = "Aries strengths",
        strengths = listOf("Courageous", "Energetic", "Direct"),
        deeperInsightTitle = "Deeper insight",
        deeperInsightBody = "Channel your momentum into one meaningful direction and make space for collaboration.",
        toolsHeadline = "Keep astrology in your routine",
        toolsBody = "Use widgets, notifications, and shareable cards to stay connected without opening the app every time.",
        widgetLabel = "Home screen widget",
        notificationLabel = "Personalized reminders",
        shareLabel = "Shareable daily cards",
        todayScoreLabel = "Today · 88%",
        premiumHeadline = "Choose the plan that fits your rhythm",
        premiumBody = "Monthly is recommended for ongoing use. Weekly stays available for shorter access.",
        monthlyPlanTitle = "Monthly",
        weeklyPlanTitle = "Weekly",
    )

internal val turkishStoreCopy =
    StoreLocalizedCopy(
        signName = "Koç",
        todayLabel = "Bugün",
        dailyHeadline = "Günlük burç yorumunuz tek bakışta",
        dailyBody = "Güne; aşk, iş, para ve iyi oluş başlıklarında kişiselleştirilmiş enerji görünümüyle başlayın.",
        dailyCardTitle = "Güçlü bir başlangıç",
        energyLabel = "Enerji",
        loveLabel = "Aşk",
        workLabel = "İş",
        dailyAdvice = "Bugün en önemli konuşma veya projeniz için net bir adım atın.",
        guidanceHeadline = "Haftayı ve ayı önceden görün",
        weeklyTitle = "Haftalık rehber",
        weeklyBody = "Haftanın güçlü gününü ve öne çıkan temalarını sade, uygulanabilir bir bakışla takip edin.",
        bestDayLabel = "En güçlü gün · Perşembe",
        monthlyTitle = "Aylık perspektif",
        monthlyBody = "İlişkiler, kariyer ve kişisel gelişim için ayın büyük resmini keşfedin.",
        monthlyThemeLabels = listOf("Aşk", "İş", "Gelişim"),
        compatibilityHeadline = "Burç uyumunu daha iyi anlayın",
        compatibilityBody = "Aşk, arkadaşlık ve iş dinamiklerini dengeli yorumlar ve net puanlarla karşılaştırın.",
        compatibilityPairLabel = "Koç + Aslan",
        friendshipLabel = "Arkadaşlık",
        personalityHeadline = "Burç kişiliğinizi keşfedin",
        personalityBody = "Güçlü yönlerinizi, ideal bağları ve daha derin burç içgörülerini modern bir profilde görün.",
        elementPlanetLabel = "Ateş · Mars",
        strengthsTitle = "Koç burcunun güçlü yönleri",
        strengths = listOf("Cesur", "Enerjik", "Doğrudan"),
        deeperInsightTitle = "Daha derin içgörü",
        deeperInsightBody = "Hızınızı anlamlı bir yöne taşıyın ve iş birliğine alan açın.",
        toolsHeadline = "Astrolojiyi günlük rutininizde tutun",
        toolsBody = "Widget, bildirim ve paylaşılabilir kartlarla uygulamayı her seferinde açmadan bağlantıda kalın.",
        widgetLabel = "Ana ekran widget'ı",
        notificationLabel = "Kişiselleştirilmiş hatırlatmalar",
        shareLabel = "Paylaşılabilir günlük kartlar",
        todayScoreLabel = "Bugün · 88%",
        premiumHeadline = "Ritminize uygun planı seçin",
        premiumBody = "Düzenli kullanım için aylık plan önerilir. Daha kısa erişim için haftalık plan da sunulur.",
        monthlyPlanTitle = "Aylık",
        weeklyPlanTitle = "Haftalık",
    )

internal fun storePremiumPlans(locale: StoreLocale): List<PremiumPlanUi> {
    val isTurkish = locale == StoreLocale.TURKISH
    val copy = if (isTurkish) turkishStoreCopy else englishStoreCopy
    val monthlyPrice = if (isTurkish) "₺394,99" else "\$6.99"
    val weeklyPrice = if (isTurkish) "₺129,99" else "\$2.29"
    val monthlyPriceMicros = if (isTurkish) 394_990_000L else 6_990_000L
    val weeklyPriceMicros = if (isTurkish) 129_990_000L else 2_290_000L
    return listOf(
        PremiumPlanUi(
            planId = "premium_monthly:monthly:default",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerToken = "monthly-offer",
            title = copy.monthlyPlanTitle,
            price = monthlyPrice,
            priceAmountMicros = monthlyPriceMicros,
            billingPeriod = "P1M",
            displayPriority = 0,
        ),
        PremiumPlanUi(
            planId = "premium_weekly:weekly:default",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerToken = "weekly-offer",
            title = copy.weeklyPlanTitle,
            price = weeklyPrice,
            priceAmountMicros = weeklyPriceMicros,
            billingPeriod = "P1W",
            displayPriority = 1,
        ),
    )
}

internal fun storePremiumState(plans: List<PremiumPlanUi>): PremiumUiState =
    PremiumUiState(
        isLoading = false,
        plans = plans,
        selectedPlanId = plans.first().planId,
        trialDays = 0,
        paywallSource = "store_listing",
    )

internal val storePremiumCallbacks =
    PremiumOfferCallbacks(
        onSelectPlan = {},
        onPurchase = {},
        onContinueFree = {},
        onRestore = {},
    )
