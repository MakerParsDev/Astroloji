package com.parsfilo.astrology.feature.premium

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.SubscriptionStatus
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PremiumViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val billingManager = mockk<BillingManager>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val remoteConfigRepository = mockk<RemoteConfigRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()

    @Test
    fun `already premium users get active subscription state and yearly savings`() =
        runTest {
            val purchaseState = MutableStateFlow<AppResult<SubscriptionStatus>?>(null)
            every { billingManager.purchaseState } returns purchaseState
            every {
                billingManager.plans
            } returns
                MutableStateFlow(
                    listOf(
                        PremiumPlanUi(
                            planId = "premium_monthly:base:default",
                            productId = "premium_monthly",
                            title = "Monthly",
                            price = "TRY 89.00",
                            priceAmountMicros = 89_000_000L,
                        ),
                        PremiumPlanUi(
                            planId = "premium_yearly:base:default",
                            productId = "premium_yearly",
                            title = "Yearly",
                            price = "TRY 499.00",
                            priceAmountMicros = 499_000_000L,
                        ),
                    ),
                )
            coJustRun { billingManager.loadPlans() }
            justRun { billingManager.clearPurchaseState() }
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags(premiumTrialDays = 7)
            coEvery { preferencesRepository.current() } returns
                UserPreferences(
                    selectedSign = "aries",
                    language = "en",
                    jwt = "jwt",
                    userId = "user-1",
                    isPremium = true,
                    subscriptionState = "grace_period",
                    premiumExpiresAt = 1_775_208_000_000L,
                )
            coJustRun { analyticsRepository.track(any(), any()) }

            val viewModel =
                PremiumViewModel(
                    billingManager = billingManager,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    preferencesRepository = preferencesRepository,
                )

            advanceUntilIdle()

            assertThat(viewModel.state.value.isAlreadyPremium).isTrue()
            assertThat(viewModel.state.value.premiumExpiresAt).isNotNull()
            assertThat(viewModel.state.value.yearlySavingsPercent).isEqualTo(53)
        }

    @Test
    fun `dismiss success clears purchase success state`() =
        runTest {
            val purchaseState =
                MutableStateFlow<AppResult<SubscriptionStatus>?>(
                    AppResult.Success(
                        SubscriptionStatus(
                            isPremium = true,
                            premiumExpiresAt = null,
                            productId = "premium_monthly",
                        ),
                    ),
                )
            every { billingManager.purchaseState } returns purchaseState
            every { billingManager.plans } returns MutableStateFlow(emptyList())
            coJustRun { billingManager.loadPlans() }
            justRun { billingManager.clearPurchaseState() }
            coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags()
            coEvery { preferencesRepository.current() } returns UserPreferences(language = "tr")
            coJustRun { analyticsRepository.track(any(), any()) }

            val viewModel =
                PremiumViewModel(
                    billingManager = billingManager,
                    analyticsRepository = analyticsRepository,
                    remoteConfigRepository = remoteConfigRepository,
                    preferencesRepository = preferencesRepository,
                )

            advanceUntilIdle()
            assertThat(viewModel.state.value.purchaseSuccess).isTrue()

            viewModel.onEvent(PremiumUiEvent.DismissSuccess)

            assertThat(viewModel.state.value.purchaseSuccess).isFalse()
        }
}
