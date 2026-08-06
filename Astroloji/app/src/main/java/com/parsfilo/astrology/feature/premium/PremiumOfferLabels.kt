package com.parsfilo.astrology.feature.premium

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi

@Composable
internal fun premiumCadenceLabel(plan: PremiumPlanUi): String =
    when (premiumBillingCadence(plan)) {
        PremiumBillingCadence.MONTHLY -> stringResource(R.string.premium_monthly_label)
        PremiumBillingCadence.YEARLY -> stringResource(R.string.premium_yearly_label)
    }

@Composable
internal fun premiumPeriodLabel(plan: PremiumPlanUi): String =
    when (premiumBillingCadence(plan)) {
        PremiumBillingCadence.MONTHLY -> stringResource(R.string.premium_period_monthly)
        PremiumBillingCadence.YEARLY -> stringResource(R.string.premium_period_yearly)
    }
