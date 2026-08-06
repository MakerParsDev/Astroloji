package com.parsfilo.astrology.feature.premium

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

@Composable
internal fun premiumCadenceLabel(plan: PremiumPlanUi): String =
    when (premiumBillingCadence(plan)) {
        PremiumBillingCadence.MONTHLY -> stringResource(R.string.premium_monthly_label)
        PremiumBillingCadence.WEEKLY -> stringResource(R.string.premium_weekly_label)
        PremiumBillingCadence.UNKNOWN -> plan.title
    }

@Composable
internal fun premiumPeriodLabel(plan: PremiumPlanUi): String =
    when (premiumBillingCadence(plan)) {
        PremiumBillingCadence.MONTHLY -> stringResource(R.string.premium_period_monthly)
        PremiumBillingCadence.WEEKLY -> stringResource(R.string.premium_period_weekly)
        PremiumBillingCadence.UNKNOWN -> stringResource(R.string.premium_period_unknown)
    }
