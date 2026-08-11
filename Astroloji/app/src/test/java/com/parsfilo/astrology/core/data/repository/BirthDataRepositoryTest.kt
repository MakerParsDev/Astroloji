package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.BirthDataResponse
import com.parsfilo.astrology.core.data.remote.CityResponse
import com.parsfilo.astrology.core.data.remote.CitySearchResponse
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class BirthDataRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        BirthDataRepository(
            api = api,
            sessionRepository = sessionRepository,
            requestExecutor = AuthenticatedRequestExecutor(),
            dispatchers =
                DispatchersProvider(
                    main = dispatcher,
                    io = dispatcher,
                    default = dispatcher,
                ),
        )

    @Test
    fun `city search returns matching cities without authentication`() =
        runTest {
            coEvery { api.searchCities("istanbul") } returns
                Response.success(
                    CitySearchResponse(
                        cities =
                            listOf(
                                CityResponse(
                                    id = "istanbul-tr",
                                    name = "Istanbul",
                                    country = "Turkey",
                                    latitude = 41.0082,
                                    longitude = 28.9784,
                                    tzid = "Europe/Istanbul",
                                ),
                            ),
                    ),
                )

            val result = repository.searchCities("istanbul")

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            val cities = (result as AppResult.Success).data
            assertThat(cities).hasSize(1)
            assertThat(cities.first().tzid).isEqualTo("Europe/Istanbul")
        }

    @Test
    fun `city search surfaces a network error without touching session state`() =
        runTest {
            coEvery { api.searchCities("istanbul") } returns
                Response.error(500, "boom".toResponseBody())

            val result = repository.searchCities("istanbul")

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception).isInstanceOf(AppException.NetworkException::class.java)
        }

    @Test
    fun `saving birth data returns the persisted time certainty`() =
        runTest {
            coEvery { api.saveBirthData(any()) } returns
                Response.success(BirthDataResponse(timeCertainty = "exact", hasBirthData = true))

            val result =
                repository.saveBirthData(
                    localDate = "1990-01-15",
                    localTime = "12:30:00",
                    timeCertainty = "exact",
                    cityId = "istanbul-tr",
                )

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.hasBirthData).isTrue()
            coVerify(exactly = 1) {
                api.saveBirthData(
                    match {
                        it.localDate == "1990-01-15" && it.localTime == "12:30:00" && it.cityId == "istanbul-tr"
                    },
                )
            }
        }

    @Test
    fun `unauthorized birth data save uses deterministic refresh and surfaces unauthorized`() =
        runTest {
            coEvery { api.saveBirthData(any()) } returns Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result =
                repository.saveBirthData(
                    localDate = "1990-01-15",
                    localTime = null,
                    timeCertainty = "unknown",
                    cityId = "istanbul-tr",
                )

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            coVerify(exactly = 1) { sessionRepository.refreshAfterUnauthorized(null) }
        }
}
