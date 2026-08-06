package com.parsfilo.astrology.feature.premium

import android.app.Activity
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.PremiumPlanUi
import com.parsfilo.astrology.core.data.repository.RemoteConfigRepository
import com.parsfilo.astrology.core.domain.model.RemoteFlags
import com.parsfilo.astrology.core.domain.model.SubscriptionStatus
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.BillingFailureReason
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
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

    private val monthlyPlan =
        PremiumPlanUi(
            planId = "premium_monthly:base:default",
            productId = "premium_monthly",
            title = "Monthly",
            price = "TRY 89.00",
            priceAmountMicros = 89_000_000L,
        )
    private val yearlyPlan =
        PremiumPlanUi(
            planId = "premium_yearly:base:default",
            productId = "premium_yearly",
            title = "Yearly",
            price = "TRY 499.00",
            priceAmountMicros = 499_000_000L,
        )

    private fun stubDependencies(
        purchaseState: MutableStateFlow<AppResult<SubscriptionStatus>?> = MutableStateFlow(null),
        plans: List<PremiumPlanUi> = listOf(monthlyPlan, yearlyPlan),
        preferences: UserPreferences = UserPreferences(language = "tr"),
    ) {
        every { billingManager.purchaseState } returns purchaseState
        every { billingManager.plans } returns MutableStateFlow(plans)
        coJustRun { billingManager.loadPlans() }
        justRun { billingManager.clearPurchaseState() }
        justRun { billingManager.launchPurchase(any(), any()) }
        coEvery { remoteConfigRepository.fetchFlags() } returns RemoteFlags(premiumTrialDays = 7)
        coEvery { preferencesRepository.current() } returns preferences
        coJustRun { analyticsRepository.track(any(), any()) }
    }

    private fun createViewModel(): PremiumViewModel =
        PremiumViewModel(
            billingManager = billingManager,
            analyticsRepository = analyticsRepository,
            remoteConfigRepository = remoteConfigRepository,
            preferencesRepository = preferencesRepository,
        )

    @Test
    fun `already premium users get active subscription state and yearly savings`() =
        runTest {
            stubDependencies(
                preferences =
                    UserPreferences(
                        selectedSign = "aries",
                        language = "en",
                        jwt = "jwt",
                        userId = "user-1",
                        isPremium = true,
                        subscriptionState = "grace_period",
                        premiumExpiresAt = 1_775_208_000_000L,
                    ),
            )

            val viewModel = createViewModel()
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
            stubDependencies(purchaseState = purchaseState, plans = emptyList())

            val viewModel = createViewModel()
            advanceUntilIdle()
            assertThat(viewModel.state.value.purchaseSuccess).isTrue()

            viewModel.onEvent(PremiumUiEvent.DismissSuccess)

            assertThat(viewModel.state.value.purchaseSuccess).isFalse()
        }

    @Test
    fun `paywall view and plan selection emit bounded funnel events`() =
        runTest {
            stubDependencies()
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = "nav"))
            viewModel.onEvent(PremiumUiEvent.SelectPlan(yearlyPlan.planId))
            advanceUntilIdle()

            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PAYWALL_VIEWED,
                    mapOf("source" to "nav"),
                )
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PAYWALL_PLAN_SELECTED,
                    mapOf(
                        "source" to "nav",
                        "plan" to yearlyPlan.planId,
                        "product" to yearlyPlan.productId,
                    ),
                )
            }
        }

    @Test
    fun `purchase start and success emit the selected product funnel`() =
        runTest {
            val purchaseState = MutableStateFlow<AppResult<SubscriptionStatus>?>(null)
            stubDependencies(purchaseState = purchaseState)
            val viewModel = createViewModel()
            val activity = mockk<Activity>()
            advanceUntilIdle()

            viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = "nav"))
            viewModel.onEvent(PremiumUiEvent.SelectPlan(yearlyPlan.planId))
            viewModel.onEvent(PremiumUiEvent.Purchase(activity))
            purchaseState.value =
                AppResult.Success(
                    SubscriptionStatus(
                        isPremium = true,
                        premiumExpiresAt = null,
                        productId = yearlyPlan.productId,
                    ),
                )
            advanceUntilIdle()

            verify(exactly = 1) { billingManager.launchPurchase(activity, yearlyPlan.planId) }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PURCHASE_STARTED,
                    mapOf(
                        "source" to "nav",
                        "plan" to yearlyPlan.planId,
                        "product" to yearlyPlan.productId,
                    ),
                )
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PURCHASE_SUCCEEDED,
                    mapOf("source" to "nav", "product" to yearlyPlan.productId),
                )
            }
        }

    @Test
    fun `user cancellation is measured separately from purchase failure`() =
        runTest {
            val purchaseState = MutableStateFlow<AppResult<SubscriptionStatus>?>(null)
            stubDependencies(purchaseState = purchaseState)
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = "nav"))
            viewModel.onEvent(PremiumUiEvent.Purchase(mockk()))
            purchaseState.value =
                AppResult.Error(
                    AppException.BillingException(
                        message = "Cancelled",
                        reason = BillingFailureReason.USER_CANCELLED,
                    ),
                )
            advanceUntilIdle()

            assertThat(viewModel.state.value.error).isNull()
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PURCHASE_CANCELLED,
                    mapOf("source" to "nav", "reason" to "user_cancelled"),
                )
            }
            coVerify(exactly = 0) {
                analyticsRepository.track(AnalyticsEvents.PURCHASE_FAILED, any())
            }
        }

    @Test
    fun `slow analytics does not block purchase success state`() =
        runTest {
            val purchaseState = MutableStateFlow<AppResult<SubscriptionStatus>?>(null)
            val analyticsGate = CompletableDeferred<Unit>()
            stubDependencies(purchaseState = purchaseState)
            coEvery {
                analyticsRepository.track(
                    AnalyticsEvents.PURCHASE_SUCCEEDED,
                    any(),
                )
            } coAnswers { analyticsGate.await() }
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = "nav"))
            viewModel.onEvent(PremiumUiEvent.Purchase(mockk()))
            purchaseState.value =
                AppResult.Success(
                    SubscriptionStatus(
                        isPremium = true,
                        premiumExpiresAt = null,
                        productId = monthlyPlan.productId,
                    ),
                )
            runCurrent()

            assertThat(viewModel.state.value.purchaseSuccess).isTrue()
            assertThat(viewModel.state.value.isAlreadyPremium).isTrue()
            analyticsGate.complete(Unit)
            advanceUntilIdle()
        }
}
