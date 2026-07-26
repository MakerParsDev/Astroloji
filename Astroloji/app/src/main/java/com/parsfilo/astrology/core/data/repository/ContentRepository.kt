package com.parsfilo.astrology.core.data.repository

import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.local.CompatibilityDao
import com.parsfilo.astrology.core.data.local.CompatibilityEntity
import com.parsfilo.astrology.core.data.local.DailyDao
import com.parsfilo.astrology.core.data.local.DailyHoroscopeEntity
import com.parsfilo.astrology.core.data.local.MonthlyDao
import com.parsfilo.astrology.core.data.local.MonthlyHoroscopeEntity
import com.parsfilo.astrology.core.data.local.PersonalityDao
import com.parsfilo.astrology.core.data.local.PersonalityEntity
import com.parsfilo.astrology.core.data.local.WeeklyDao
import com.parsfilo.astrology.core.data.local.WeeklyHoroscopeEntity
import com.parsfilo.astrology.core.data.remote.AstrologyApi
import com.parsfilo.astrology.core.data.remote.ErrorEnvelope
import com.parsfilo.astrology.core.data.remote.RewardClaimRequest
import com.parsfilo.astrology.core.data.remote.RewardPrepareRequest
import com.parsfilo.astrology.core.data.session.AuthenticatedRequestExecutor
import com.parsfilo.astrology.core.domain.model.CompatibilityReport
import com.parsfilo.astrology.core.domain.model.DailyHoroscope
import com.parsfilo.astrology.core.domain.model.MonthlyHoroscope
import com.parsfilo.astrology.core.domain.model.PersonalityReport
import com.parsfilo.astrology.core.domain.model.RewardChallenge
import com.parsfilo.astrology.core.domain.model.WeeklyHoroscope
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.DispatchersProvider
import com.parsfilo.astrology.core.util.StringsProvider
import com.parsfilo.astrology.core.util.TimeUtils
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import retrofit2.Response
import java.time.Duration
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
@Suppress("LongParameterList")
class ContentRepository
    @Inject
    constructor(
        private val api: AstrologyApi,
        private val dailyDao: DailyDao,
        private val weeklyDao: WeeklyDao,
        private val monthlyDao: MonthlyDao,
        private val compatibilityDao: CompatibilityDao,
        private val personalityDao: PersonalityDao,
        private val sessionRepository: SessionRepository,
        private val requestExecutor: AuthenticatedRequestExecutor,
        private val dispatchers: DispatchersProvider,
        private val json: Json,
        private val stringsProvider: StringsProvider,
    ) {
        private val dailyTtl = Duration.ofHours(23)
        private val weeklyTtl = Duration.ofDays(6)
        private val monthlyTtl = Duration.ofDays(27)
        private val evergreenTtl = Duration.ofDays(30)

        suspend fun getDaily(
            sign: String,
            language: String,
            date: String,
            forceRefresh: Boolean = false,
        ): AppResult<DailyHoroscope> =
            withContext(dispatchers.io) {
                val cached = dailyDao.get(sign, date, language)
                if (!forceRefresh && cached != null && !TimeUtils.isExpired(cached.cachedAt, dailyTtl)) {
                    return@withContext AppResult.Success(cached.toDomain())
                }

                when (val network = fetchDaily(sign, language, date)) {
                    is AppResult.Success -> {
                        dailyDao.upsert(network.data.toEntity())
                        network
                    }
                    is AppResult.Error -> cached?.let { AppResult.Success(it.toDomain()) } ?: network
                    AppResult.Loading -> AppResult.Loading
                }
            }

        suspend fun getWeekly(
            sign: String,
            language: String,
            week: String,
            forceRefresh: Boolean = false,
        ): AppResult<WeeklyHoroscope> =
            withContext(dispatchers.io) {
                val cached = weeklyDao.get(sign, week, language)
                if (!forceRefresh && cached != null && !TimeUtils.isExpired(cached.cachedAt, weeklyTtl)) {
                    return@withContext AppResult.Success(cached.toDomain())
                }

                when (val network = fetchWeekly(sign, language, week)) {
                    is AppResult.Success -> {
                        weeklyDao.upsert(network.data.toEntity())
                        network
                    }
                    is AppResult.Error -> cached?.let { AppResult.Success(it.toDomain()) } ?: network
                    AppResult.Loading -> AppResult.Loading
                }
            }

        suspend fun getMonthly(
            sign: String,
            language: String,
            month: String,
            forceRefresh: Boolean = false,
        ): AppResult<MonthlyHoroscope> =
            withContext(dispatchers.io) {
                val cached = monthlyDao.get(sign, month, language)
                if (!forceRefresh && cached != null && !TimeUtils.isExpired(cached.cachedAt, monthlyTtl)) {
                    return@withContext AppResult.Success(cached.toDomain())
                }

                when (val network = fetchMonthly(sign, language, month)) {
                    is AppResult.Success -> {
                        monthlyDao.upsert(network.data.toEntity())
                        network
                    }
                    is AppResult.Error -> cached?.let { AppResult.Success(it.toDomain()) } ?: network
                    AppResult.Loading -> AppResult.Loading
                }
            }

        suspend fun getCompatibility(
            sign1: String,
            sign2: String,
            language: String,
            forceRefresh: Boolean = false,
        ): AppResult<CompatibilityReport> =
            withContext(dispatchers.io) {
                val pair = listOf(sign1, sign2).sorted()
                val cached = compatibilityDao.get(pair[0], pair[1], language)
                if (!forceRefresh && cached != null && !TimeUtils.isExpired(cached.cachedAt, evergreenTtl)) {
                    return@withContext AppResult.Success(cached.toDomain())
                }

                when (val network = fetchCompatibility(pair[0], pair[1], language)) {
                    is AppResult.Success -> {
                        compatibilityDao.upsert(network.data.toEntity())
                        network
                    }
                    is AppResult.Error -> cached?.let { AppResult.Success(it.toDomain()) } ?: network
                    AppResult.Loading -> AppResult.Loading
                }
            }

        suspend fun getPersonality(
            sign: String,
            language: String,
            forceRefresh: Boolean = false,
        ): AppResult<PersonalityReport> =
            withContext(dispatchers.io) {
                val cached = personalityDao.get(sign, language)
                if (!forceRefresh && cached != null && !TimeUtils.isExpired(cached.cachedAt, evergreenTtl)) {
                    return@withContext AppResult.Success(cached.toDomain())
                }

                when (val network = fetchPersonality(sign, language)) {
                    is AppResult.Success -> {
                        personalityDao.upsert(network.data.toEntity())
                        network
                    }
                    is AppResult.Error -> cached?.let { AppResult.Success(it.toDomain()) } ?: network
                    AppResult.Loading -> AppResult.Loading
                }
            }

        suspend fun cleanupOldCache() =
            withContext(dispatchers.io) {
                val now = System.currentTimeMillis()
                dailyDao.deleteOlderThan(now - dailyTtl.toMillis())
                weeklyDao.deleteOlderThan(now - weeklyTtl.toMillis())
                monthlyDao.deleteOlderThan(now - monthlyTtl.toMillis())
                compatibilityDao.deleteOlderThan(now - evergreenTtl.toMillis())
                personalityDao.deleteOlderThan(now - evergreenTtl.toMillis())
            }

        suspend fun prepareRewardUnlock(
            rewardType: String,
            identifier: String,
        ): AppResult<RewardChallenge> =
            withContext(dispatchers.io) {
                val response =
                    authenticatedRequest {
                        api.prepareReward(RewardPrepareRequest(rewardType = rewardType, identifier = identifier))
                    }
                when {
                    response.isSuccessful -> {
                        val body =
                            response.body()
                                ?: return@withContext AppResult.Error(
                                    AppException.NetworkException("Reward challenge response was empty."),
                                )
                        AppResult.Success(
                            RewardChallenge(
                                challengeId = body.challengeId,
                                customData = body.customData,
                                userId = body.userId,
                                rewardType = body.rewardType,
                                identifier = body.identifier,
                                expiresAt = body.expiresAt,
                            ),
                        )
                    }
                    response.code() == 401 -> AppResult.Error(AppException.UnauthorizedException())
                    else -> AppResult.Error(AppException.NetworkException(response.errorMessage()))
                }
            }

        suspend fun claimRewardUnlock(
            challengeId: String,
        ): AppResult<Unit> =
            withContext(dispatchers.io) {
                val outcome =
                    pollRewardClaim(
                        maxAttempts = REWARD_CLAIM_MAX_ATTEMPTS,
                        delayMillis = REWARD_CLAIM_DELAY_MILLIS,
                    ) {
                        val response =
                            authenticatedRequest {
                                api.claimReward(RewardClaimRequest(challengeId = challengeId))
                            }
                        RewardClaimAttempt(
                            statusCode = response.code(),
                            errorCode = response.errorCode(),
                        )
                    }
                when (outcome) {
                    RewardClaimPollOutcome.CLAIMED -> AppResult.Success(Unit)
                    RewardClaimPollOutcome.UNAUTHORIZED -> AppResult.Error(AppException.UnauthorizedException())
                    RewardClaimPollOutcome.TIMED_OUT ->
                        AppResult.Error(AppException.NetworkException("Reward verification is still pending."))
                    RewardClaimPollOutcome.FAILED ->
                        AppResult.Error(AppException.NetworkException("Reward verification failed."))
                }
            }

        private fun Response<*>.errorCode(): String? {
            val raw = errorBody()?.string().orEmpty()
            return runCatching { json.decodeFromString<ErrorEnvelope>(raw).error.code }.getOrNull()
        }

        private fun Response<*>.errorMessage(): String {
            val raw = errorBody()?.string().orEmpty()
            return runCatching { json.decodeFromString<ErrorEnvelope>(raw).error.message }
                .getOrNull()
                .orEmpty()
                .ifBlank { message() }
        }

        private suspend fun fetchDaily(
            sign: String,
            language: String,
            date: String,
        ): AppResult<DailyHoroscope> =
            safeContentCall {
                val response = authenticatedRequest { api.getDaily(sign, language, date) }
                if (!response.isSuccessful) throw HttpException(response)
                val body = response.body() ?: throw AppException.NetworkException(stringsProvider.get(R.string.content_error_daily_empty))
                DailyHoroscope(
                    date = body.date,
                    sign = body.sign,
                    language = body.language,
                    short = body.short,
                    full = body.full,
                    love = body.love,
                    career = body.career,
                    money = body.money,
                    health = body.health,
                    dailyTip = body.dailyTip,
                    luckyNumber = body.luckyNumber,
                    luckyColor = body.luckyColor,
                    energy = body.energy,
                    loveScore = body.loveScore,
                    careerScore = body.careerScore,
                    moneyScore = body.moneyScore,
                    healthScore = body.healthScore,
                )
            }

        private suspend fun fetchWeekly(
            sign: String,
            language: String,
            week: String,
        ): AppResult<WeeklyHoroscope> =
            safeContentCall {
                val response = authenticatedRequest { api.getWeekly(sign, language, week) }
                if (!response.isSuccessful) throw HttpException(response)
                val body = response.body() ?: throw AppException.NetworkException(stringsProvider.get(R.string.content_error_weekly_empty))
                WeeklyHoroscope(
                    week = body.week,
                    weekStart = body.weekStart,
                    weekEnd = body.weekEnd,
                    sign = body.sign,
                    language = body.language,
                    summary = body.summary,
                    love = body.love,
                    career = body.career,
                    money = body.money,
                    bestDay = body.bestDay,
                    warning = body.warning,
                )
            }

        private suspend fun fetchMonthly(
            sign: String,
            language: String,
            month: String,
        ): AppResult<MonthlyHoroscope> =
            safeContentCall {
                val response = authenticatedRequest { api.getMonthly(sign, language, month) }
                if (!response.isSuccessful) throw HttpException(response)
                val body = response.body() ?: throw AppException.NetworkException(stringsProvider.get(R.string.content_error_monthly_empty))
                MonthlyHoroscope(
                    month = body.month,
                    monthStart = body.monthStart,
                    monthEnd = body.monthEnd,
                    sign = body.sign,
                    language = body.language,
                    summary = body.summary,
                    love = body.love,
                    career = body.career,
                    money = body.money,
                    bestDay = body.bestDay,
                    warning = body.warning,
                )
            }

        private suspend fun fetchCompatibility(
            sign1: String,
            sign2: String,
            language: String,
        ): AppResult<CompatibilityReport> =
            safeContentCall {
                val response = authenticatedRequest { api.getCompatibility(sign1, sign2, language) }
                if (!response.isSuccessful) throw HttpException(response)
                val body =
                    response.body() ?: throw AppException.NetworkException(stringsProvider.get(R.string.content_error_compatibility_empty))
                CompatibilityReport(
                    sign1 = body.sign1,
                    sign2 = body.sign2,
                    language = body.language,
                    overallScore = body.overallScore,
                    loveScore = body.loveScore,
                    friendshipScore = body.friendshipScore,
                    workScore = body.workScore,
                    summary = body.summary,
                    strengths = body.strengths,
                    challenges = body.challenges,
                    advice = body.advice,
                    famousCouples = body.famousCouples,
                )
            }

        private suspend fun fetchPersonality(
            sign: String,
            language: String,
        ): AppResult<PersonalityReport> =
            safeContentCall {
                val response = authenticatedRequest { api.getPersonality(sign, language) }
                if (!response.isSuccessful) throw HttpException(response)
                val body =
                    response.body() ?: throw AppException.NetworkException(stringsProvider.get(R.string.content_error_personality_empty))
                PersonalityReport(
                    sign = body.sign,
                    language = body.language,
                    summary = body.summary,
                    deepAnalysis = body.deepAnalysis,
                    strengths = body.strengths,
                    weaknesses = body.weaknesses,
                    idealPartners = body.idealPartners,
                    careerFit = body.careerFit,
                    element = body.element,
                    planet = body.planet,
                    color = body.color,
                    stone = body.stone,
                )
            }

        private suspend fun <T> authenticatedRequest(request: suspend () -> Response<T>): Response<T> =
            requestExecutor.execute(
                request,
                sessionRepository::refreshAfterUnauthorized,
                sessionRepository::invalidateSession,
            )

        private suspend fun <T> safeContentCall(block: suspend () -> T): AppResult<T> =
            runCatching { block() }.fold(
                onSuccess = { AppResult.Success(it) },
                onFailure = {
                    if (it is CancellationException) throw it
                    AppResult.Error(it.toAppException())
                },
            )

        private fun Throwable.toAppException(): AppException =
            when (this) {
                is AppException -> this
                is HttpException ->
                    when (code()) {
                        401 -> AppException.UnauthorizedException()
                        404 -> AppException.NotFoundException()
                        403 -> AppException.PremiumRequiredException()
                        else -> AppException.NetworkException(message())
                    }
                else -> AppException.UnknownException(message ?: "Beklenmeyen hata", this)
            }

        private fun DailyHoroscope.toEntity() =
            DailyHoroscopeEntity(
                sign = sign,
                date = date,
                language = language,
                short = short,
                full = full,
                love = love,
                career = career,
                money = money,
                health = health,
                dailyTip = dailyTip,
                luckyNumber = luckyNumber,
                luckyColor = luckyColor,
                energy = energy,
                loveScore = loveScore,
                careerScore = careerScore,
                moneyScore = moneyScore,
                healthScore = healthScore,
                cachedAt = System.currentTimeMillis(),
            )

        private fun DailyHoroscopeEntity.toDomain() =
            DailyHoroscope(
                date = date,
                sign = sign,
                language = language,
                short = short,
                full = full,
                love = love,
                career = career,
                money = money,
                health = health,
                dailyTip = dailyTip,
                luckyNumber = luckyNumber,
                luckyColor = luckyColor,
                energy = energy,
                loveScore = loveScore,
                careerScore = careerScore,
                moneyScore = moneyScore,
                healthScore = healthScore,
            )

        private fun WeeklyHoroscope.toEntity() =
            WeeklyHoroscopeEntity(
                sign = sign,
                week = week,
                weekStart = weekStart,
                weekEnd = weekEnd,
                language = language,
                summary = summary,
                love = love,
                career = career,
                money = money,
                bestDay = bestDay,
                warning = warning,
                cachedAt = System.currentTimeMillis(),
            )

        private fun WeeklyHoroscopeEntity.toDomain() =
            WeeklyHoroscope(
                week = week,
                weekStart = weekStart,
                weekEnd = weekEnd,
                sign = sign,
                language = language,
                summary = summary,
                love = love,
                career = career,
                money = money,
                bestDay = bestDay,
                warning = warning,
            )

        private fun MonthlyHoroscope.toEntity() =
            MonthlyHoroscopeEntity(
                sign = sign,
                month = month,
                language = language,
                monthStart = monthStart,
                monthEnd = monthEnd,
                summary = summary,
                love = love,
                career = career,
                money = money,
                bestDay = bestDay,
                warning = warning,
                cachedAt = System.currentTimeMillis(),
            )

        private fun MonthlyHoroscopeEntity.toDomain() =
            MonthlyHoroscope(
                month = month,
                monthStart = monthStart,
                monthEnd = monthEnd,
                sign = sign,
                language = language,
                summary = summary,
                love = love,
                career = career,
                money = money,
                bestDay = bestDay,
                warning = warning,
            )

        private fun CompatibilityReport.toEntity() =
            CompatibilityEntity(
                sign1 = sign1,
                sign2 = sign2,
                language = language,
                overallScore = overallScore,
                loveScore = loveScore ?: 0,
                friendshipScore = friendshipScore ?: 0,
                workScore = workScore ?: 0,
                summary = summary,
                strengths = strengths.joinToString(LIST_DELIMITER),
                challenges = challenges.joinToString(LIST_DELIMITER),
                advice = advice,
                famousCouples = famousCouples.joinToString(LIST_DELIMITER),
                cachedAt = System.currentTimeMillis(),
            )

        private fun CompatibilityEntity.toDomain() =
            CompatibilityReport(
                sign1 = sign1,
                sign2 = sign2,
                language = language,
                overallScore = overallScore,
                loveScore = loveScore,
                friendshipScore = friendshipScore,
                workScore = workScore,
                summary = summary,
                strengths = strengths.decodeList(),
                challenges = challenges.decodeList(),
                advice = advice,
                famousCouples = famousCouples?.decodeList().orEmpty(),
            )

        private fun PersonalityReport.toEntity() =
            PersonalityEntity(
                sign = sign,
                language = language,
                summary = summary,
                deepAnalysis = deepAnalysis,
                strengths = strengths.joinToString(LIST_DELIMITER),
                weaknesses = weaknesses.joinToString(LIST_DELIMITER),
                idealPartners = idealPartners.joinToString(LIST_DELIMITER),
                careerFit = careerFit.joinToString(LIST_DELIMITER),
                element = element,
                planet = planet,
                color = color,
                stone = stone,
                cachedAt = System.currentTimeMillis(),
            )

        private fun PersonalityEntity.toDomain() =
            PersonalityReport(
                sign = sign,
                language = language,
                summary = summary,
                deepAnalysis = deepAnalysis,
                strengths = strengths.decodeList(),
                weaknesses = weaknesses.decodeList(),
                idealPartners = idealPartners.decodeList(),
                careerFit = careerFit?.decodeList().orEmpty(),
                element = element,
                planet = planet,
                color = color,
                stone = stone,
            )

        private companion object {
            private const val LIST_DELIMITER = "|||"
            private const val REWARD_CLAIM_MAX_ATTEMPTS = 6
            private const val REWARD_CLAIM_DELAY_MILLIS = 750L
        }

        private fun String.decodeList(): List<String> =
            takeIf { it.isNotBlank() }
                ?.split(LIST_DELIMITER)
                ?.filter { it.isNotBlank() }
                .orEmpty()
    }
