package com.parsfilo.astrology.feature.chat

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.core.data.remote.ChatMessageResponse
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.ReadingRepository
import com.parsfilo.astrology.core.domain.model.UserPreferences
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import io.mockk.coEvery
import io.mockk.coJustRun
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val readingRepository = mockk<ReadingRepository>()
    private val preferencesRepository = mockk<UserPreferencesRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()

    private fun stubDependencies(preferences: UserPreferences = UserPreferences(language = "en")) {
        coEvery { preferencesRepository.current() } returns preferences
        coJustRun { analyticsRepository.track(any(), any()) }
    }

    private fun createViewModel(): ChatViewModel =
        ChatViewModel(
            readingRepository = readingRepository,
            preferencesRepository = preferencesRepository,
            analyticsRepository = analyticsRepository,
        )

    @Test
    fun `sending a message appends the reply and updates balance`() =
        runTest {
            stubDependencies()
            coEvery { readingRepository.sendChatMessage("en", "Will I find love?", emptyList()) } returns
                AppResult.Success(ChatMessageResponse(reply = "The stars are aligned.", balance = 10))
            val viewModel = createViewModel()

            viewModel.onEvent(ChatUiEvent.InputChanged("Will I find love?"))
            viewModel.onEvent(ChatUiEvent.Send)
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.messages).hasSize(2)
            assertThat(
                viewModel.uiState.value.messages
                    .last()
                    .content,
            ).isEqualTo("The stars are aligned.")
            assertThat(viewModel.uiState.value.balance).isEqualTo(10)
            assertThat(viewModel.uiState.value.input).isEmpty()
            coVerify(exactly = 1) {
                analyticsRepository.track(AnalyticsEvents.CREDIT_SPENT, mapOf("feature" to "chat_consultation"))
            }
        }

    @Test
    fun `blank input is not sent`() =
        runTest {
            stubDependencies()
            val viewModel = createViewModel()

            viewModel.onEvent(ChatUiEvent.InputChanged("   "))
            viewModel.onEvent(ChatUiEvent.Send)
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.messages).isEmpty()
            coVerify(exactly = 0) { readingRepository.sendChatMessage(any(), any(), any()) }
        }

    @Test
    fun `a failed send rolls back the optimistic message and restores the input`() =
        runTest {
            stubDependencies()
            coEvery { readingRepository.sendChatMessage("en", "hi", emptyList()) } returns
                AppResult.Error(AppException.BillingException("Not enough credits."))
            val viewModel = createViewModel()

            viewModel.onEvent(ChatUiEvent.InputChanged("hi"))
            viewModel.onEvent(ChatUiEvent.Send)
            advanceUntilIdle()

            assertThat(viewModel.uiState.value.messages).isEmpty()
            assertThat(viewModel.uiState.value.input).isEqualTo("hi")
            assertThat(viewModel.uiState.value.insufficientCredits).isTrue()
        }
}
