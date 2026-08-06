package com.parsfilo.astrology.feature.premium

import android.app.Activity
import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.BillingCatalogueDiagnostic
import com.parsfilo.astrology.core.data.repository.BillingCatalogueLoadResult
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
            planId = "premium_monthly:monthly:default",
            productId = "premium_monthly",
            basePlanId = "monthly",
            offerToken = "monthly-offer-token",
            title = "Monthly",
            price = "TRY 394.99",
            priceAmountMicros = 394_990_000L,
            billingPeriod = "P1M",
            displayPriority = 0,
        )
    private val weeklyPlan =
        PremiumPlanUi(
            planId = "premium_weekly:weekly:default",
            productId = "premium_weekly",
            basePlanId = "weekly",
            offerToken = "weekly-offer-token",
            title = "Weekly",
            price = "TRY 129.99",
            priceAmountMicros = 129_990_000L,
            billingPeriod = "P1W",
            displayPriority = 1,
        )

    private fun success(
        plans: List<PremiumPlanUi> = listOf(weeklyPlan, monthlyPlan),
    ): BillingCatalogueLoadResult.Success =
        BillingCatalogueLoadResult.Success(
            plans = plans,
            diagnostics = emptyList(),
        )

    private fun stubDependencies(
        purchaseState: MutableStateFlow<AppResult<SubscriptionStatus>?> = MutableStateFlow(null),
        catalogueResult: BillingCatalogueLoadResult = success(),
        preferences: UserPreferences = UserPreferences(language = "tr"),
    ) {
        every { billingManager.purchaseState } returns purchaseState
        coEvery { billingManager.loadPlans() } returns catalogueResult
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
    fun `monthly plan is selected by default even when Play returns weekly first`() =
        runTest {
            stubDependencies(catalogueResult = success(listOf(weeklyPlan, monthlyPlan)))

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.state.value.plans).containsExactly(weeklyPlan, monthlyPlan).inOrder()
            assertThat(viewModel.state.value.selectedPlanId).isEqualTo(monthlyPlan.planId)
            assertThat(viewModel.state.value.isLoading).isFalse()
        }

    @Test
    fun `weekly only catalogue selects weekly by default`() =
        runTest {
            stubDependencies(catalogueResult = success(listOf(weeklyPlan)))

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.state.value.selectedPlanId).isEqualTo(weeklyPlan.planId)
        }

    @Test
    fun `catalogue failure exposes retryable empty state`() =
        runTest {
            stubDependencies(
                catalogueResult =
                    BillingCatalogueLoadResult.Failure(
                        message = "catalogue unavailable",
                        diagnostics = listOf(BillingCatalogueDiagnostic("premium_weekly", 3)),
                    ),
            )

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.state.value.isLoading).isFalse()
            assertThat(viewModel.state.value.plans).isEmpty()
            assertThat(viewModel.state.value.selectedPlanId).isEmpty()
            assertThat(viewModel.state.value.error).isEqualTo("catalogue unavailable")
        }

    @Test
    fun `retry catalogue clears error shows loading and loads a second time`() =
        runTest {
            val retryResult = CompletableDeferred<BillingCatalogueLoadResult>()
            var loadCalls = 0
            stubDependencies()
            coEvery { billingManager.loadPlans() } coAnswers {
                loadCalls += 1
                if (loadCalls == 1) {
                    BillingCatalogueLoadResult.Failure("catalogue unavailable", emptyList())
                } else {
                    retryResult.await()
                }
            }
            val viewModel = createViewModel()
            advanceUntilIdle()
            assertThat(viewModel.state.value.error).isEqualTo("catalogue unavailable")

            viewModel.onEvent(PremiumUiEvent.RetryCatalogue)
            runCurrent()

            assertThat(viewModel.state.value.isLoading).isTrue()
            assertThat(viewModel.state.value.error).isNull()
            coVerify(exactly = 2) { billingManager.loadPlans() }

            retryResult.complete(success())
            advanceUntilIdle()
            assertThat(viewModel.state.value.isLoading).isFalse()
            assertThat(viewModel.state.value.selectedPlanId).isEqualTo(monthlyPlan.planId)
        }

    @Test
    fun `already premium users keep active subscription state`() =
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
            stubDependencies(purchaseState = purchaseState, catalogueResult = success(emptyList()))

            val viewModel = createViewModel()
            advanceUntilIdle()
            assertThat(viewModel.state.value.purchaseSuccess).isTrue()

            viewModel.onEvent(PremiumUiEvent.DismissSuccess)

            assertThat(viewModel.state.value.purchaseSuccess).isFalse()
        }

    @Test
    fun `paywall view and weekly selection emit bounded funnel events`() =
        runTest {
            stubDependencies()
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = "nav"))
            viewModel.onEvent(PremiumUiEvent.SelectPlan(weeklyPlan.planId))
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
                        "plan" to weeklyPlan.planId,
                        "product" to weeklyPlan.productId,
                    ),
                )
            }
        }

    @Test
    fun `weekly purchase start and success emit selected product funnel`() =
        runTest {
            val purchaseState = MutableStateFlow<AppResult<SubscriptionStatus>?>(null)
            stubDependencies(purchaseState = purchaseState)
            val viewModel = createViewModel()
            val activity = mockk<Activity>()
            advanceUntilIdle()

            viewModel.onEvent(PremiumUiEvent.ScreenViewed(source = "nav"))
            viewModel.onEvent(PremiumUiEvent.SelectPlan(weeklyPlan.planId))
            viewModel.onEvent(PremiumUiEvent.Purchase(activity))
            purchaseState.value =
                AppResult.Success(
                    SubscriptionStatus(
                        isPremium = true,
                        premiumExpiresAt = null,
                        productId = weeklyPlan.productId,
                    ),
                )
            advanceUntilIdle()

            verify(exactly = 1) { billingManager.launchPurchase(activity, weeklyPlan.planId) }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PURCHASE_STARTED,
                    mapOf(
                        "source" to "nav",
                        "plan" to weeklyPlan.planId,
                        "product" to weeklyPlan.productId,
                    ),
                )
            }
            coVerify(exactly = 1) {
                analyticsRepository.track(
                    AnalyticsEvents.PURCHASE_SUCCEEDED,
                    mapOf("source" to "nav", "product" to weeklyPlan.productId),
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
