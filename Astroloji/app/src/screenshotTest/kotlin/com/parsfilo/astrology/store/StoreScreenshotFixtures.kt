package com.parsfilo.astrology.store

import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.feature.premium.PremiumOfferCallbacks
import com.parsfilo.astrology.feature.premium.PremiumUiState

internal enum class StoreLocale {
    ENGLISH,
    TURKISH,
}

internal data class StoreLocalizedCopy(
    val dailyHeadline: String,
    val dailyBody: String,
    val guidanceHeadline: String,
    val weeklyTitle: String,
    val weeklyBody: String,
    val monthlyTitle: String,
    val monthlyBody: String,
    val compatibilityHeadline: String,
    val compatibilityBody: String,
    val personalityHeadline: String,
    val personalityBody: String,
    val strengthsTitle: String,
    val strengths: List<String>,
    val toolsHeadline: String,
    val toolsBody: String,
    val widgetLabel: String,
    val notificationLabel: String,
    val shareLabel: String,
    val premiumHeadline: String,
    val premiumBody: String,
)

internal val englishStoreCopy =
    StoreLocalizedCopy(
        dailyHeadline = "Your daily horoscope, at a glance",
        dailyBody = "Start the day with a personalized energy overview and clear guidance for love, work, money, and wellbeing.",
        guidanceHeadline = "See the week and month ahead",
        weeklyTitle = "Weekly guidance",
        weeklyBody = "Focus your attention with a practical overview of the week, its strongest day, and key themes.",
        monthlyTitle = "Monthly perspective",
        monthlyBody = "Explore the bigger picture with monthly themes for relationships, career, and personal growth.",
        compatibilityHeadline = "Understand zodiac compatibility",
        compatibilityBody = "Compare love, friendship, and work dynamics with clear scores and balanced insights.",
        personalityHeadline = "Discover your zodiac personality",
        personalityBody = "Explore strengths, ideal connections, and deeper sign-based insights in a polished profile.",
        strengthsTitle = "Aries strengths",
        strengths = listOf("Courageous", "Energetic", "Direct"),
        toolsHeadline = "Keep astrology in your routine",
        toolsBody = "Use widgets, notifications, and shareable cards to stay connected without opening the app every time.",
        widgetLabel = "Home screen widget",
        notificationLabel = "Personalized reminders",
        shareLabel = "Shareable daily cards",
        premiumHeadline = "Choose the plan that fits your rhythm",
        premiumBody = "Monthly is recommended for ongoing use. Weekly stays available for shorter access.",
    )

internal val turkishStoreCopy =
    StoreLocalizedCopy(
        dailyHeadline = "Günlük burç yorumunuz tek bakışta",
        dailyBody = "Güne; aşk, iş, para ve iyi oluş başlıklarında kişiselleştirilmiş enerji görünümüyle başlayın.",
        guidanceHeadline = "Haftayı ve ayı önceden görün",
        weeklyTitle = "Haftalık rehber",
        weeklyBody = "Haftanın güçlü gününü ve öne çıkan temalarını sade, uygulanabilir bir bakışla takip edin.",
        monthlyTitle = "Aylık perspektif",
        monthlyBody = "İlişkiler, kariyer ve kişisel gelişim için ayın büyük resmini keşfedin.",
        compatibilityHeadline = "Burç uyumunu daha iyi anlayın",
        compatibilityBody = "Aşk, arkadaşlık ve iş dinamiklerini dengeli yorumlar ve net puanlarla karşılaştırın.",
        personalityHeadline = "Burç kişiliğinizi keşfedin",
        personalityBody = "Güçlü yönlerinizi, ideal bağları ve daha derin burç içgörülerini modern bir profilde görün.",
        strengthsTitle = "Koç burcunun güçlü yönleri",
        strengths = listOf("Cesur", "Enerjik", "Doğrudan"),
        toolsHeadline = "Astrolojiyi günlük rutininizde tutun",
        toolsBody = "Widget, bildirim ve paylaşılabilir kartlarla uygulamayı her seferinde açmadan bağlantıda kalın.",
        widgetLabel = "Ana ekran widget'ı",
        notificationLabel = "Kişiselleştirilmiş hatırlatmalar",
        shareLabel = "Paylaşılabilir günlük kartlar",
        premiumHeadline = "Ritminize uygun planı seçin",
        premiumBody = "Düzenli kullanım için aylık plan önerilir. Daha kısa erişim için haftalık plan da sunulur.",
    )

internal fun storePremiumPlans(locale: StoreLocale): List<PremiumPlanUi> {
    val monthlyPrice = if (locale == StoreLocale.TURKISH) "₺394,99" else "\$6.99"
    val weeklyPrice = if (locale == StoreLocale.TURKISH) "₺129,99" else "\$2.29"
    return listOf(
        PremiumPlanUi(
            planId = "premium_monthly:monthly:default",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerToken = "monthly-offer",
            title = "Monthly",
            price = monthlyPrice,
            priceAmountMicros = 394_990_000,
            billingPeriod = "P1M",
            displayPriority = 0,
        ),
        PremiumPlanUi(
            planId = "premium_weekly:weekly:default",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerToken = "weekly-offer",
            title = "Weekly",
            price = weeklyPrice,
            priceAmountMicros = 129_990_000,
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
