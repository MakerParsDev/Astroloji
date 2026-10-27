package com.parsfilo.astrology.feature.settings

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.UpdateUserRequest
import com.parsfilo.astrology.core.data.repository.BillingManager
import com.parsfilo.astrology.core.data.repository.BirthDataRepository
import com.parsfilo.astrology.core.data.repository.FavoritesRepository
import com.parsfilo.astrology.core.data.repository.MoodRepository
import com.parsfilo.astrology.core.data.repository.SessionRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.domain.model.UserProfile
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
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
    private val birthDataRepository = mockk<BirthDataRepository>()
    private val moodRepository = mockk<MoodRepository>()

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
    fun `offline reminder change keeps local hour and surfaces unsynced profile error`() =
        runTest {
            coEvery { preferencesRepository.updateNotification(true, 8) } returns Unit
            coEvery { sessionRepository.updateProfile(any()) } returns
                AppResult.Error(AppException.NetworkException("Offline: server profile not synchronized."))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.ChangeNotificationHour(8))
            advanceUntilIdle()

            assertThat(viewModel.state.value.notificationHour).isEqualTo(8)
            assertThat(viewModel.state.value.error)
                .isEqualTo("Offline: server profile not synchronized.")
            coVerify(exactly = 1) { preferencesRepository.updateNotification(true, 8) }
            coVerify(exactly = 1) { sessionRepository.updateProfile(any()) }
        }

    @Test
    fun `successful reminder sync does not clear an unrelated failed language sync`() =
        runTest {
            val failure = "Language could not be synchronized."
            coEvery { preferencesRepository.updateLanguage("en") } returns Unit
            coEvery { preferencesRepository.updateNotification(true, 8) } returns Unit
            coEvery {
                sessionRepository.updateProfile(match { it.language == "en" })
            } returns AppResult.Error(AppException.NetworkException(failure))
            coEvery {
                sessionRepository.updateProfile(match { it.notificationHour == 8 })
            } returns AppResult.Success(mockk<UserProfile>())
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.ChangeLanguage("en"))
            advanceUntilIdle()
            assertThat(viewModel.state.value.error).isEqualTo(failure)

            viewModel.onEvent(SettingsUiEvent.ChangeNotificationHour(8))
            advanceUntilIdle()
            assertThat(viewModel.state.value.notificationHour).isEqualTo(8)
            assertThat(viewModel.state.value.error).isEqualTo(failure)

            coEvery {
                sessionRepository.updateProfile(match { it.language == "en" })
            } returns AppResult.Success(mockk<UserProfile>())
            viewModel.onEvent(SettingsUiEvent.ChangeLanguage("en"))
            advanceUntilIdle()
            assertThat(viewModel.state.value.error).isNull()
        }

    @Test
    fun `rapid disable and hour selection cannot restore enabled notifications`() =
        runTest {
            val firstWriteGate = CompletableDeferred<Unit>()
            val preferenceWrites = mutableListOf<Pair<Boolean, Int>>()
            val remoteWrites = mutableListOf<UpdateUserRequest>()
            coEvery { preferencesRepository.updateNotification(any(), any()) } coAnswers {
                preferenceWrites.add(firstArg<Boolean>() to secondArg<Int>())
                if (preferenceWrites.size == 1) firstWriteGate.await()
            }
            coEvery { sessionRepository.updateProfile(any()) } coAnswers {
                remoteWrites.add(firstArg<UpdateUserRequest>())
                AppResult.Success(mockk<UserProfile>())
            }
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.ChangeNotificationEnabled(false))
            runCurrent()
            viewModel.onEvent(SettingsUiEvent.ChangeNotificationHour(8))
            runCurrent()
            assertThat(viewModel.state.value.notificationEnabled).isFalse()
            assertThat(viewModel.state.value.notificationHour).isEqualTo(8)

            firstWriteGate.complete(Unit)
            advanceUntilIdle()

            assertThat(preferenceWrites.last()).isEqualTo(false to 8)
            assertThat(remoteWrites.last().notificationEnabled).isFalse()
            assertThat(remoteWrites.last().notificationHour).isEqualTo(8)
            assertThat(viewModel.state.value.notificationEnabled).isFalse()
        }

    @Test
    fun `birth profile deletion requires explicit confirmation`() =
        runTest {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.ConfirmBirthDataDeletion)
            advanceUntilIdle()
            coVerify(exactly = 0) { birthDataRepository.deleteBirthData() }

            viewModel.onEvent(SettingsUiEvent.RequestBirthDataDeletion)
            advanceUntilIdle()
            assertThat(viewModel.state.value.showDeleteBirthDataConfirmation).isTrue()
            viewModel.onEvent(SettingsUiEvent.DismissBirthDataDeletion)
            advanceUntilIdle()
            assertThat(viewModel.state.value.showDeleteBirthDataConfirmation).isFalse()
            coVerify(exactly = 0) { birthDataRepository.deleteBirthData() }
        }

    @Test
    fun `successful birth profile deletion preserves account and reports success`() =
        runTest {
            coEvery { birthDataRepository.deleteBirthData() } returns AppResult.Success(Unit)
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestBirthDataDeletion)
            advanceUntilIdle()
            viewModel.onEvent(SettingsUiEvent.ConfirmBirthDataDeletion)
            advanceUntilIdle()

            assertThat(viewModel.state.value.birthDataDeleted).isTrue()
            assertThat(viewModel.state.value.showDeleteBirthDataConfirmation).isFalse()
            assertThat(viewModel.state.value.isDeletingBirthData).isFalse()
            coVerify(exactly = 1) { birthDataRepository.deleteBirthData() }
            coVerify(exactly = 0) { sessionRepository.deleteAccount() }
        }

    @Test
    fun `failed birth profile deletion keeps confirmation open without a success claim`() =
        runTest {
            coEvery { birthDataRepository.deleteBirthData() } returns
                AppResult.Error(AppException.NetworkException("Profile deletion failed."))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestBirthDataDeletion)
            advanceUntilIdle()
            viewModel.onEvent(SettingsUiEvent.ConfirmBirthDataDeletion)
            advanceUntilIdle()

            assertThat(viewModel.state.value.birthDataDeleted).isFalse()
            assertThat(viewModel.state.value.showDeleteBirthDataConfirmation).isTrue()
            assertThat(viewModel.state.value.birthDataDeletionError).isEqualTo("Profile deletion failed.")
            assertThat(viewModel.state.value.isDeletingBirthData).isFalse()
            coVerify(exactly = 0) { sessionRepository.deleteAccount() }
        }

    @Test
    fun `mood history deletion requires explicit confirmation and preserves account`() =
        runTest {
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.ConfirmMoodDeletion)
            advanceUntilIdle()
            coVerify(exactly = 0) { moodRepository.deleteMoodHistory() }

            viewModel.onEvent(SettingsUiEvent.RequestMoodDeletion)
            advanceUntilIdle()
            assertThat(viewModel.state.value.showDeleteMoodConfirmation).isTrue()
            viewModel.onEvent(SettingsUiEvent.DismissMoodDeletion)
            advanceUntilIdle()
            assertThat(viewModel.state.value.showDeleteMoodConfirmation).isFalse()
            coVerify(exactly = 0) { moodRepository.deleteMoodHistory() }
            coVerify(exactly = 0) { sessionRepository.deleteAccount() }
        }

    @Test
    fun `confirmed mood history deletion reports success without deleting birth data or account`() =
        runTest {
            coEvery { moodRepository.deleteMoodHistory() } returns AppResult.Success(Unit)
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestMoodDeletion)
            advanceUntilIdle()
            viewModel.onEvent(SettingsUiEvent.ConfirmMoodDeletion)
            advanceUntilIdle()

            assertThat(viewModel.state.value.moodHistoryDeleted).isTrue()
            assertThat(viewModel.state.value.showDeleteMoodConfirmation).isFalse()
            assertThat(viewModel.state.value.isDeletingMoodHistory).isFalse()
            coVerify(exactly = 1) { moodRepository.deleteMoodHistory() }
            coVerify(exactly = 0) { birthDataRepository.deleteBirthData() }
            coVerify(exactly = 0) { sessionRepository.deleteAccount() }
        }

    @Test
    fun `failed mood history deletion preserves confirmation and never claims success`() =
        runTest {
            coEvery { moodRepository.deleteMoodHistory() } returns
                AppResult.Error(AppException.NetworkException("Synthetic deletion failure"))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(SettingsUiEvent.RequestMoodDeletion)
            advanceUntilIdle()
            viewModel.onEvent(SettingsUiEvent.ConfirmMoodDeletion)
            advanceUntilIdle()

            assertThat(viewModel.state.value.showDeleteMoodConfirmation).isTrue()
            assertThat(viewModel.state.value.moodHistoryDeleted).isFalse()
            assertThat(viewModel.state.value.moodDeletionError).isEqualTo("Synthetic deletion failure")
            assertThat(viewModel.state.value.isDeletingMoodHistory).isFalse()
            coVerify(exactly = 0) { sessionRepository.deleteAccount() }
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
            birthDataRepository = birthDataRepository,
            moodRepository = moodRepository,
        )
}

private suspend fun <T> Flow<T>.receiveAsFlowForTest(): T = withTimeout(1_000) { first() }
