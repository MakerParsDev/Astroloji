package com.parsfilo.astrology.core.data.repository

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.ChartAngleResponse
import com.parsfilo.astrology.core.data.remote.ChartZodiacPositionResponse
import com.parsfilo.astrology.core.data.remote.GuidanceEvidenceResponse
import com.parsfilo.astrology.core.data.remote.GuidanceSignalResponse
import com.parsfilo.astrology.core.data.remote.MahadashaResponse
import com.parsfilo.astrology.core.data.remote.MoonNakshatraResponse
import com.parsfilo.astrology.core.data.remote.NatalChartResponse
import com.parsfilo.astrology.core.data.remote.PersonalGuidanceResponse
import com.parsfilo.astrology.core.data.remote.SiderealPositionResponse
import com.parsfilo.astrology.core.data.remote.VedicChartResponse
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
class ChartRepositoryTest {
    private val api = mockk<AstrologyApi>()
    private val sessionRepository = mockk<SessionRepository>()
    private val dispatcher = UnconfinedTestDispatcher()
    private val repository =
        ChartRepository(
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
    fun `guidance response maps all three traceable signals without local persistence`() =
        runTest {
            coEvery { api.getPersonalGuidance(any()) } returns Response.success(guidanceResponse())

            val result =
                repository.getPersonalGuidance(
                    natalTimestamp = "1990-01-15T12:00:00.000Z",
                    natalTimeCertainty = "unknown",
                    targetTimestamp = "2026-08-05T00:00:00.000Z",
                    language = "tr",
                )

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            val guidance = (result as AppResult.Success).data
            assertThat(guidance.version).isEqualTo("personal-guidance-v1")
            assertThat(guidance.signals).hasSize(3)
            val firstEvidence = guidance.signals.first().evidence
            assertThat(firstEvidence.transitBody).isEqualTo("neptune")
            assertThat(firstEvidence.natalBody).isEqualTo("jupiter")
            assertThat(firstEvidence.orb).isEqualTo(0.84)
            assertThat(guidance.limitations).contains("birth_time_uncertain")
            assertThat(guidance.disclaimer).contains("öz değerlendirme")
            coVerify(exactly = 1) {
                api.getPersonalGuidance(
                    match {
                        it.natalTimestamp == "1990-01-15T12:00:00.000Z" &&
                            it.natalTimeCertainty == "unknown" &&
                            it.targetTimestamp == "2026-08-05T00:00:00.000Z" &&
                            it.language == "tr"
                    },
                )
            }
        }

    @Test
    fun `unauthorized guidance response uses deterministic refresh and surfaces unauthorized`() =
        runTest {
            coEvery { api.getPersonalGuidance(any()) } returns
                Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result =
                repository.getPersonalGuidance(
                    natalTimestamp = "1990-01-15T12:00:00.000Z",
                    natalTimeCertainty = "exact",
                    targetTimestamp = "2026-08-05T00:00:00.000Z",
                    language = "en",
                )

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            coVerify(exactly = 1) { sessionRepository.refreshAfterUnauthorized(null) }
            coVerify(exactly = 0) { sessionRepository.invalidateSession() }
        }

    @Test
    fun `empty successful guidance response fails closed`() =
        runTest {
            coEvery { api.getPersonalGuidance(any()) } returns Response.success(null)

            val result =
                repository.getPersonalGuidance(
                    natalTimestamp = "1990-01-15T12:00:00.000Z",
                    natalTimeCertainty = "exact",
                    targetTimestamp = "2026-08-05T00:00:00.000Z",
                    language = "en",
                )

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.NetworkException::class.java)
        }

    @Test
    fun `natal chart request omits observer when coordinates are missing`() =
        runTest {
            coEvery { api.getNatalChart(any()) } returns Response.success(natalChartResponse(ascendant = null))

            val result =
                repository.getNatalChart(
                    timestamp = "1990-01-15T12:00:00.000Z",
                    timeCertainty = "unknown",
                    latitude = null,
                    longitude = null,
                )

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            assertThat((result as AppResult.Success).data.ascendant).isNull()
            coVerify(exactly = 1) {
                api.getNatalChart(match { it.observer == null })
            }
        }

    @Test
    fun `natal chart request carries observer and returns the computed ascendant`() =
        runTest {
            coEvery { api.getNatalChart(any()) } returns Response.success(natalChartResponse(ascendant = "leo"))

            val result =
                repository.getNatalChart(
                    timestamp = "1990-01-15T12:00:00.000Z",
                    timeCertainty = "exact",
                    latitude = 41.0,
                    longitude = 29.0,
                )

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            val ascendant = (result as AppResult.Success).data.ascendant
            assertThat(ascendant?.zodiac?.sign).isEqualTo("leo")
            coVerify(exactly = 1) {
                api.getNatalChart(
                    match {
                        it.observer?.latitude == 41.0 && it.observer.longitude == 29.0
                    },
                )
            }
        }

    @Test
    fun `vedic chart response maps sidereal positions, moon nakshatra, and mahadashas`() =
        runTest {
            coEvery { api.getVedicChartForMe() } returns Response.success(vedicChartResponse())

            val result = repository.getVedicChart()

            assertThat(result).isInstanceOf(AppResult.Success::class.java)
            val chart = (result as AppResult.Success).data
            assertThat(chart.version).isEqualTo("vedic-chart-v1")
            assertThat(chart.ayanamsa).isEqualTo(23.7)
            assertThat(chart.positions).hasSize(1)
            assertThat(chart.positions.first().body).isEqualTo("moon")
            assertThat(chart.positions.first().signKey).isEqualTo("leo")
            assertThat(chart.moonNakshatra.nakshatra).isEqualTo("purva_phalguni")
            assertThat(chart.moonNakshatra.pada).isEqualTo(4)
            assertThat(chart.mahadashas).hasSize(1)
            assertThat(chart.mahadashas.first().graha).isEqualTo("venus")
            coVerify(exactly = 1) { api.getVedicChartForMe() }
        }

    @Test
    fun `vedic chart request surfaces a birth-data-required error on HTTP 400`() =
        runTest {
            coEvery { api.getVedicChartForMe() } returns
                Response.error(400, "birth data required".toResponseBody())

            val result = repository.getVedicChart()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.NetworkException::class.java)
        }

    @Test
    fun `unauthorized vedic chart response uses deterministic refresh and surfaces unauthorized`() =
        runTest {
            coEvery { api.getVedicChartForMe() } returns
                Response.error(401, "unauthorized".toResponseBody())
            coEvery { sessionRepository.refreshAfterUnauthorized(null) } returns
                AppResult.Error(AppException.UnauthorizedException())

            val result = repository.getVedicChart()

            assertThat(result).isInstanceOf(AppResult.Error::class.java)
            assertThat((result as AppResult.Error).exception)
                .isInstanceOf(AppException.UnauthorizedException::class.java)
            coVerify(exactly = 1) { sessionRepository.refreshAfterUnauthorized(null) }
        }

    private fun vedicChartResponse(): VedicChartResponse =
        VedicChartResponse(
            version = "vedic-chart-v1",
            calculationVersion = "astronomy-engine-2.1.19-true-chitrapaksha",
            timeCertainty = "exact",
            ayanamsa = 23.7,
            positions =
                listOf(
                    SiderealPositionResponse(
                        body = "moon",
                        longitude = 143.8,
                        latitude = -2.7,
                        zodiac = ChartZodiacPositionResponse(sign = "leo", degree = 23.8),
                    ),
                ),
            moonNakshatra = MoonNakshatraResponse(nakshatra = "purva_phalguni", index = 10, pada = 4),
            mahadashas =
                listOf(
                    MahadashaResponse(
                        graha = "venus",
                        startDate = "1990-01-15T12:00:00.000Z",
                        endDate = "1994-05-07T15:42:14.844Z",
                        years = 4.3,
                    ),
                ),
            limitations = emptyList(),
        )

    private fun natalChartResponse(ascendant: String?): NatalChartResponse =
        NatalChartResponse(
            version = "natal-chart-v1",
            ascendant =
                ascendant?.let {
                    ChartAngleResponse(
                        longitude = 134.2,
                        zodiac = ChartZodiacPositionResponse(sign = it, degree = 14.2),
                    )
                },
        )

    private fun guidanceResponse(): PersonalGuidanceResponse =
        PersonalGuidanceResponse(
            version = "personal-guidance-v1",
            calculationVersion = "guidance-rules-v1",
            generatedAt = "2026-08-05T00:00:01.000Z",
            targetTimestamp = "2026-08-05T00:00:00.000Z",
            language = "tr",
            signals =
                listOf(
                    signal("neptune_square_jupiter", 94, "neptune", "jupiter", 0.84),
                    signal("neptune_square_uranus", 84, "neptune", "uranus", 2.4),
                    signal("saturn_square_neptune", 82, "saturn", "neptune", 2.11),
                ),
            limitations = listOf("houses_and_ascendant_not_calculated", "birth_time_uncertain"),
            disclaimer = "Bu içerik eğlence ve öz değerlendirme içindir.",
        )

    private fun signal(
        id: String,
        priority: Int,
        transitBody: String,
        natalBody: String,
        orb: Double,
    ): GuidanceSignalResponse =
        GuidanceSignalResponse(
            id = id,
            priority = priority,
            domain = "growth",
            title = "İzlenebilir sinyal",
            summary = "Yansıtıcı özet",
            actionPrompt = "Küçük ve güvenli bir adım seç.",
            evidence =
                GuidanceEvidenceResponse(
                    transitBody = transitBody,
                    natalBody = natalBody,
                    aspect = "square",
                    orb = orb,
                    maximumOrb = 3.0,
                ),
        )
}
