package com.parsfilo.astrology.feature.settings

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val sessionRepository = mockk<SessionRepository>()
    private val favoritesRepository = mockk<FavoritesRepository>()
    private val billingManager = mockk<BillingManager>()

    @Before
    fun setUp() {
        coEvery { preferencesRepository.current() } returns UserPreferences(onboardingCompleted = true)
        coEvery { sessionRepository.loadProfile() } returns
            AppResult.Success(
                UserProfile(
                    userId = "user-1",
                    sign = "aries",
                    language = "tr",
                    isPremium = false,
                    premiumExpiresAt = null,
                    jwt = "jwt",
                    utcOffset = 3,
                    notificationEnabled = true,
                    notificationHour = 9,
                ),
            )
        coEvery { favoritesRepository.getFavorites() } returns emptyList()
    }

    @Test
    fun `account deletion confirmation can be opened and dismissed`() =
        runTest {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestAccountDeletion)
            advanceUntilIdle()
            assertThat(viewModel.state.value.showDeleteConfirmation).isTrue()

            viewModel.onEvent(SettingsUiEvent.DismissAccountDeletion)
            advanceUntilIdle()
            assertThat(viewModel.state.value.showDeleteConfirmation).isFalse()
        }

    @Test
    fun `successful account deletion emits navigation effect`() =
        runTest {
            coEvery { sessionRepository.deleteAccount() } returns AppResult.Success(Unit)
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestAccountDeletion)
            viewModel.onEvent(SettingsUiEvent.ConfirmAccountDeletion)
            advanceUntilIdle()

            assertThat(viewModel.effects.receiveAsFlowForTest()).isEqualTo(SettingsEffect.AccountDeleted)
            assertThat(viewModel.state.value.isDeletingAccount).isFalse()
            assertThat(viewModel.state.value.showDeleteConfirmation).isFalse()
            assertThat(viewModel.state.value.error).isNull()
        }

    @Test
    fun `failed account deletion keeps the user on settings and shows the error`() =
        runTest {
            coEvery { sessionRepository.deleteAccount() } returns
                AppResult.Error(AppException.NetworkException("Account deletion failed."))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestAccountDeletion)
            viewModel.onEvent(SettingsUiEvent.ConfirmAccountDeletion)
            advanceUntilIdle()

            assertThat(viewModel.state.value.isDeletingAccount).isFalse()
            assertThat(viewModel.state.value.showDeleteConfirmation).isTrue()
            assertThat(viewModel.state.value.error).isEqualTo("Account deletion failed.")
        }

    private fun createViewModel() =
        SettingsViewModel(
            preferencesRepository = preferencesRepository,
            sessionRepository = sessionRepository,
            favoritesRepository = favoritesRepository,
            billingManager = billingManager,
        )
}

private suspend fun <T> Flow<T>.receiveAsFlowForTest(): T = withTimeout(1_000) { first() }
