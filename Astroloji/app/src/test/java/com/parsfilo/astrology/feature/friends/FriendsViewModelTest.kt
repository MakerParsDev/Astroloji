package com.parsfilo.astrology.feature.friends

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.MainDispatcherRule
import com.parsfilo.astrology.core.data.remote.AcceptInviteResponse
import com.parsfilo.astrology.core.data.remote.FriendResponse
import com.parsfilo.astrology.core.data.remote.InviteCodeResponse
import com.parsfilo.astrology.core.data.repository.AnalyticsEvents
import com.parsfilo.astrology.core.data.repository.AnalyticsRepository
import com.parsfilo.astrology.core.data.repository.FriendsRepository
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.StringsProvider
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
class FriendsViewModelTest {
    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val friendsRepository = mockk<FriendsRepository>()
    private val analyticsRepository = mockk<AnalyticsRepository>()
    private val stringsProvider = mockk<StringsProvider>()

    private fun stubDependencies(friends: AppResult<List<FriendResponse>> = AppResult.Success(emptyList())) {
        coEvery { friendsRepository.getFriends() } returns friends
        coJustRun { analyticsRepository.track(any(), any()) }
        coEvery { stringsProvider.get(any()) } returns "Friend added."
    }

    private fun createViewModel(): FriendsViewModel =
        FriendsViewModel(
            friendsRepository = friendsRepository,
            analyticsRepository = analyticsRepository,
            stringsProvider = stringsProvider,
        )

    @Test
    fun `loads friends on init and maps recognized signs`() =
        runTest {
            stubDependencies(
                friends =
                    AppResult.Success(
                        listOf(FriendResponse("user-2", "leo", "tr"), FriendResponse("user-3", "not-a-sign", "en")),
                    ),
            )

            val viewModel = createViewModel()
            advanceUntilIdle()

            assertThat(viewModel.state.value.isLoading).isFalse()
            assertThat(
                viewModel.state.value.friends
                    .map { it.userId },
            ).containsExactly("user-2")
        }

    @Test
    fun `generating an invite stores the code and emits a share effect`() =
        runTest {
            stubDependencies()
            coEvery { friendsRepository.createInvite() } returns
                AppResult.Success(InviteCodeResponse(code = "ABCDEFGH", expiresAt = "2026-08-18T00:00:00.000Z"))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(FriendsUiEvent.GenerateInvite)
            advanceUntilIdle()

            assertThat(viewModel.state.value.inviteCode).isEqualTo("ABCDEFGH")
            coVerify(exactly = 1) { analyticsRepository.track(AnalyticsEvents.FRIEND_INVITED, emptyMap()) }
        }

    @Test
    fun `redeeming a code clears the input and reloads friends on success`() =
        runTest {
            stubDependencies()
            coEvery { friendsRepository.acceptInvite("ABCDEFGH") } returns
                AppResult.Success(AcceptInviteResponse(ok = true, duplicate = false, friendUserId = "user-1"))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(FriendsUiEvent.RedeemCodeChanged("abcdefgh"))
            viewModel.onEvent(FriendsUiEvent.RedeemCode)
            advanceUntilIdle()

            assertThat(viewModel.state.value.redeemCodeInput).isEmpty()
            assertThat(viewModel.state.value.infoMessage).isEqualTo("Friend added.")
            coVerify(exactly = 1) { friendsRepository.acceptInvite("ABCDEFGH") }
            coVerify(exactly = 1) { analyticsRepository.track(AnalyticsEvents.FRIEND_ACCEPTED, emptyMap()) }
            coVerify(exactly = 2) { friendsRepository.getFriends() }
        }

    @Test
    fun `a failed redeem surfaces the error and keeps the typed code`() =
        runTest {
            stubDependencies()
            coEvery { friendsRepository.acceptInvite("BADCODE1") } returns
                AppResult.Error(AppException.NetworkException("Invite code was not found."))
            val viewModel = createViewModel()
            advanceUntilIdle()

            viewModel.onEvent(FriendsUiEvent.RedeemCodeChanged("badcode1"))
            viewModel.onEvent(FriendsUiEvent.RedeemCode)
            advanceUntilIdle()

            assertThat(viewModel.state.value.error).isEqualTo("Invite code was not found.")
            assertThat(viewModel.state.value.redeemCodeInput).isEqualTo("BADCODE1")
        }
}
