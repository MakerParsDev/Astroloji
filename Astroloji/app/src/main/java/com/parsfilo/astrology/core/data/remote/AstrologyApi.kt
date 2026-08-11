package com.parsfilo.astrology.core.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class RegisterUserRequest(
    val sign: String,
    val language: String,
    @SerialName("firebase_installation_id") val firebaseInstallationId: String? = null,
    @SerialName("notification_hour") val notificationHour: Int,
    @SerialName("utc_offset") val utcOffset: Int,
    val platform: String = "android",
)

@Serializable
data class RegisterUserResponse(
    @SerialName("user_id") val userId: String,
    val jwt: String,
    @SerialName("is_premium") val isPremium: Boolean,
    @SerialName("subscription_state") val subscriptionState: String = "none",
    @SerialName("premium_expires_at") val premiumExpiresAt: String? = null,
)

@Serializable
data class UserProfileResponse(
    @SerialName("user_id") val userId: String,
    val sign: String,
    val language: String,
    @SerialName("is_premium") val isPremium: Boolean,
    @SerialName("subscription_state") val subscriptionState: String = "none",
    @SerialName("premium_expires_at") val premiumExpiresAt: String? = null,
    @SerialName("notification_enabled") val notificationEnabled: Boolean,
    @SerialName("notification_hour") val notificationHour: Int,
    @SerialName("utc_offset") val utcOffset: Int,
)

@Serializable
data class UpdateUserRequest(
    val sign: String? = null,
    val language: String? = null,
    @SerialName("firebase_installation_id") val firebaseInstallationId: String? = null,
    @SerialName("notification_enabled") val notificationEnabled: Boolean? = null,
    @SerialName("notification_hour") val notificationHour: Int? = null,
    @SerialName("utc_offset") val utcOffset: Int? = null,
    val platform: String? = null,
)

@Serializable
data class DeleteUserResponse(
    val ok: Boolean,
    @SerialName("user_id") val userId: String,
    @SerialName("firebase_account_deleted") val firebaseAccountDeleted: Boolean,
)

@Serializable
data class DailyResponse(
    val date: String,
    val language: String,
    val sign: String,
    val short: String,
    val full: String? = null,
    val love: String? = null,
    val career: String? = null,
    val money: String? = null,
    val health: String? = null,
    @SerialName("daily_tip") val dailyTip: String? = null,
    @SerialName("lucky_number") val luckyNumber: Int,
    @SerialName("lucky_color") val luckyColor: String,
    val energy: Int,
    @SerialName("love_score") val loveScore: Int,
    @SerialName("career_score") val careerScore: Int,
    @SerialName("money_score") val moneyScore: Int,
    @SerialName("health_score") val healthScore: Int,
)

@Serializable
data class RefreshTokenResponse(
    val jwt: String,
    @SerialName("is_premium") val isPremium: Boolean,
    @SerialName("subscription_state") val subscriptionState: String = "none",
)

@Serializable
data class WeeklyResponse(
    val week: String,
    @SerialName("week_start") val weekStart: String,
    @SerialName("week_end") val weekEnd: String,
    val language: String,
    val sign: String,
    val summary: String? = null,
    val love: String? = null,
    val career: String? = null,
    val money: String? = null,
    @SerialName("best_day") val bestDay: String? = null,
    val warning: String? = null,
)

@Serializable
data class MonthlyResponse(
    val month: String,
    @SerialName("month_start") val monthStart: String? = null,
    @SerialName("month_end") val monthEnd: String? = null,
    val language: String,
    val sign: String,
    val summary: String? = null,
    val love: String? = null,
    val career: String? = null,
    val money: String? = null,
    @SerialName("best_day") val bestDay: String? = null,
    val warning: String? = null,
)

@Serializable
data class CompatibilityResponse(
    val sign1: String,
    val sign2: String,
    val language: String,
    @SerialName("overall_score") val overallScore: Int,
    @SerialName("love_score") val loveScore: Int? = null,
    @SerialName("friendship_score") val friendshipScore: Int? = null,
    @SerialName("work_score") val workScore: Int? = null,
    val summary: String,
    val strengths: List<String> = emptyList(),
    val challenges: List<String> = emptyList(),
    val advice: String? = null,
    @SerialName("famous_couples") val famousCouples: List<String> = emptyList(),
)

@Serializable
data class PersonalityResponse(
    val sign: String,
    val language: String,
    val summary: String,
    @SerialName("deep_analysis") val deepAnalysis: String? = null,
    val strengths: List<String> = emptyList(),
    val weaknesses: List<String> = emptyList(),
    @SerialName("ideal_partners") val idealPartners: List<String> = emptyList(),
    @SerialName("career_fit") val careerFit: List<String> = emptyList(),
    val element: String,
    val planet: String,
    val color: String,
    val stone: String,
)

@Serializable
data class VerifySubscriptionRequest(
    @SerialName("purchase_token") val purchaseToken: String,
    @SerialName("product_id") val productId: String,
)

@Serializable
data class VerifySubscriptionResponse(
    @SerialName("is_premium") val isPremium: Boolean,
    @SerialName("subscription_state") val subscriptionState: String = "none",
    @SerialName("premium_expires_at") val premiumExpiresAt: String? = null,
    @SerialName("product_id") val productId: String,
)

@Serializable
data class VerifyCreditPurchaseRequest(
    @SerialName("purchase_token") val purchaseToken: String,
    @SerialName("product_id") val productId: String,
)

@Serializable
data class VerifyCreditPurchaseResponse(
    val ok: Boolean,
    val duplicate: Boolean = false,
    @SerialName("credits_granted") val creditsGranted: Int,
    val balance: Int,
)

@Serializable
data class SpendCreditsRequest(
    val amount: Int,
    val feature: String,
)

@Serializable
data class SpendCreditsResponse(
    val ok: Boolean,
    val balance: Int,
)

@Serializable
data class CreditBalanceResponse(
    val balance: Int,
)

@Serializable
data class InviteCodeResponse(
    val code: String,
    @SerialName("expires_at") val expiresAt: String,
)

@Serializable
data class AcceptInviteRequest(
    val code: String,
)

@Serializable
data class AcceptInviteResponse(
    val ok: Boolean,
    val duplicate: Boolean = false,
    @SerialName("friend_user_id") val friendUserId: String,
)

@Serializable
data class FriendResponse(
    @SerialName("user_id") val userId: String,
    val sign: String,
    val language: String,
)

@Serializable
data class FriendsListResponse(
    val friends: List<FriendResponse> = emptyList(),
)

@Serializable
data class FriendRemovalResponse(
    val ok: Boolean,
)

@Serializable
data class DeepReadingRequest(
    val language: String,
)

@Serializable
data class DeepReadingResponse(
    val text: String,
    val cached: Boolean,
    @SerialName("credits_spent") val creditsSpent: Int,
)

@Serializable
data class ChatTurnPayload(
    val role: String,
    val content: String,
)

@Serializable
data class ChatMessageRequest(
    val language: String,
    val message: String,
    val history: List<ChatTurnPayload> = emptyList(),
)

@Serializable
data class ChatMessageResponse(
    val reply: String,
    val balance: Int,
)

@Serializable
data class StreakCheckInResponse(
    @SerialName("streak_count") val streakCount: Int,
    @SerialName("last_streak_date") val lastStreakDate: String,
    @SerialName("milestone_achieved") val milestoneAchieved: Int? = null,
    @SerialName("credits_granted") val creditsGranted: Int,
    val balance: Int,
)

@Serializable
data class MoodLogRequest(
    val mood: String,
    val domain: String? = null,
)

@Serializable
data class MoodLogResponse(
    val date: String,
    val mood: String,
    val domain: String? = null,
)

@Serializable
data class MoodInsight(
    val domain: String,
    val occurrences: Int,
    val correlated: Int,
)

@Serializable
data class MoodInsightResponse(
    val insight: MoodInsight? = null,
)

@Serializable
data class RewardPrepareRequest(
    @SerialName("reward_type") val rewardType: String,
    val identifier: String,
)

@Serializable
data class RewardChallengeResponse(
    @SerialName("challenge_id") val challengeId: String,
    @SerialName("custom_data") val customData: String,
    @SerialName("user_id") val userId: String,
    @SerialName("reward_type") val rewardType: String,
    val identifier: String,
    @SerialName("expires_at") val expiresAt: String,
)

@Serializable
data class RewardClaimRequest(
    @SerialName("challenge_id") val challengeId: String,
)

@Serializable
data class RewardClaimResponse(
    val ok: Boolean,
    val duplicate: Boolean = false,
    @SerialName("challenge_id") val challengeId: String,
    @SerialName("reward_type") val rewardType: String,
    val identifier: String,
    @SerialName("entitlement_expires_at") val entitlementExpiresAt: String,
)

@Serializable
data class TrackEventRequest(
    @SerialName("event_type") val eventType: String,
    val meta: Map<String, String> = emptyMap(),
)

@Serializable
data class PersonalGuidanceRequest(
    @SerialName("natal_timestamp") val natalTimestamp: String,
    @SerialName("natal_time_certainty") val natalTimeCertainty: String,
    @SerialName("target_timestamp") val targetTimestamp: String,
    val language: String,
)

@Serializable
data class PersonalGuidanceResponse(
    val version: String,
    val calculationVersion: String,
    val generatedAt: String,
    val targetTimestamp: String,
    val language: String,
    val signals: List<GuidanceSignalResponse>,
    val limitations: List<String>,
    val disclaimer: String,
)

@Serializable
data class GuidanceSignalResponse(
    val id: String,
    val priority: Int,
    val domain: String,
    val title: String,
    val summary: String,
    val actionPrompt: String,
    val evidence: GuidanceEvidenceResponse,
)

@Serializable
data class GuidanceEvidenceResponse(
    val transitBody: String,
    val natalBody: String,
    val aspect: String,
    val orb: Double,
    val maximumOrb: Double,
)

@Serializable
data class TrackEventResponse(
    val ok: Boolean,
)

@Serializable
data class CityResponse(
    val id: String,
    val name: String,
    val country: String,
    val latitude: Double,
    val longitude: Double,
    val tzid: String,
)

@Serializable
data class CitySearchResponse(
    val cities: List<CityResponse> = emptyList(),
)

@Serializable
data class SaveBirthDataRequest(
    @SerialName("local_date") val localDate: String,
    @SerialName("local_time") val localTime: String? = null,
    @SerialName("time_certainty") val timeCertainty: String,
    @SerialName("city_id") val cityId: String,
)

@Serializable
data class BirthDataResponse(
    @SerialName("time_certainty") val timeCertainty: String,
    @SerialName("has_birth_data") val hasBirthData: Boolean,
)

@Serializable
data class ChartObserverPayload(
    val latitude: Double,
    val longitude: Double,
)

@Serializable
data class NatalChartRequest(
    val timestamp: String,
    @SerialName("time_certainty") val timeCertainty: String,
    val observer: ChartObserverPayload? = null,
)

@Serializable
data class ChartZodiacPositionResponse(
    val sign: String,
    val degree: Double,
)

@Serializable
data class ChartAngleResponse(
    val longitude: Double,
    val zodiac: ChartZodiacPositionResponse,
)

@Serializable
data class NatalChartResponse(
    val version: String,
    val ascendant: ChartAngleResponse? = null,
    val midheaven: ChartAngleResponse? = null,
    val limitations: List<String> = emptyList(),
)

@Serializable
data class ErrorEnvelope(
    val error: ErrorBody,
)

@Serializable
data class ErrorBody(
    val code: String,
    val message: String,
)

interface AstrologyApi {
    @POST("api/v1/users/register")
    suspend fun registerUser(
        @Header("Authorization") authorization: String,
        @Body body: RegisterUserRequest,
    ): Response<RegisterUserResponse>

    @GET("api/v1/users/me")
    suspend fun getUserProfile(): Response<UserProfileResponse>

    @PUT("api/v1/users/me")
    suspend fun updateUser(
        @Body body: UpdateUserRequest,
    ): Response<UserProfileResponse>

    @DELETE("api/v1/users/me")
    suspend fun deleteUser(): Response<DeleteUserResponse>

    @POST("api/v1/users/refresh-token")
    suspend fun refreshUserToken(): Response<RefreshTokenResponse>

    @GET("api/v1/content/daily")
    suspend fun getDaily(
        @Query("sign") sign: String,
        @Query("lang") language: String,
        @Query("date") date: String,
    ): Response<DailyResponse>

    @GET("api/v1/content/weekly")
    suspend fun getWeekly(
        @Query("sign") sign: String,
        @Query("lang") language: String,
        @Query("week") week: String,
    ): Response<WeeklyResponse>

    @GET("api/v1/content/monthly")
    suspend fun getMonthly(
        @Query("sign") sign: String,
        @Query("lang") language: String,
        @Query("month") month: String,
    ): Response<MonthlyResponse>

    @GET("api/v1/content/compat")
    suspend fun getCompatibility(
        @Query("sign1") sign1: String,
        @Query("sign2") sign2: String,
        @Query("lang") language: String,
    ): Response<CompatibilityResponse>

    @GET("api/v1/content/personality")
    suspend fun getPersonality(
        @Query("sign") sign: String,
        @Query("lang") language: String,
    ): Response<PersonalityResponse>

    @POST("api/v1/subscriptions/verify")
    suspend fun verifySubscription(
        @Body body: VerifySubscriptionRequest,
    ): Response<VerifySubscriptionResponse>

    @POST("api/v1/subscriptions/restore")
    suspend fun restoreSubscription(
        @Body body: VerifySubscriptionRequest,
    ): Response<VerifySubscriptionResponse>

    @POST("api/v1/credits/verify")
    suspend fun verifyCreditPurchase(
        @Body body: VerifyCreditPurchaseRequest,
    ): Response<VerifyCreditPurchaseResponse>

    @POST("api/v1/credits/spend")
    suspend fun spendCredits(
        @Body body: SpendCreditsRequest,
    ): Response<SpendCreditsResponse>

    @GET("api/v1/credits/balance")
    suspend fun getCreditBalance(): Response<CreditBalanceResponse>

    @POST("api/v1/friends/invite")
    suspend fun createFriendInvite(): Response<InviteCodeResponse>

    @POST("api/v1/friends/accept")
    suspend fun acceptFriendInvite(
        @Body body: AcceptInviteRequest,
    ): Response<AcceptInviteResponse>

    @GET("api/v1/friends")
    suspend fun getFriends(): Response<FriendsListResponse>

    @DELETE("api/v1/friends/{friendUserId}")
    suspend fun removeFriend(
        @Path("friendUserId") friendUserId: String,
    ): Response<FriendRemovalResponse>

    @POST("api/v1/reading/deep")
    suspend fun getDeepReading(
        @Body body: DeepReadingRequest,
    ): Response<DeepReadingResponse>

    @POST("api/v1/chat/message")
    suspend fun sendChatMessage(
        @Body body: ChatMessageRequest,
    ): Response<ChatMessageResponse>

    @POST("api/v1/streak/checkin")
    suspend fun checkInStreak(): Response<StreakCheckInResponse>

    @POST("api/v1/mood/log")
    suspend fun logMood(
        @Body body: MoodLogRequest,
    ): Response<MoodLogResponse>

    @GET("api/v1/mood/insight")
    suspend fun getMoodInsight(): Response<MoodInsightResponse>

    @POST("api/v1/rewards/prepare")
    suspend fun prepareReward(
        @Body body: RewardPrepareRequest,
    ): Response<RewardChallengeResponse>

    @POST("api/v1/rewards/claim")
    suspend fun claimReward(
        @Body body: RewardClaimRequest,
    ): Response<RewardClaimResponse>

    @POST("api/v1/chart/guidance")
    suspend fun getPersonalGuidance(
        @Body body: PersonalGuidanceRequest,
    ): Response<PersonalGuidanceResponse>

    @POST("api/v1/chart/natal")
    suspend fun getNatalChart(
        @Body body: NatalChartRequest,
    ): Response<NatalChartResponse>

    @GET("api/v1/cities/search")
    suspend fun searchCities(
        @Query("q") query: String,
        @Query("limit") limit: Int = 8,
    ): Response<CitySearchResponse>

    @PUT("api/v1/users/me/birth-data")
    suspend fun saveBirthData(
        @Body body: SaveBirthDataRequest,
    ): Response<BirthDataResponse>

    @POST("api/v1/events/track")
    suspend fun trackEvent(
        @Body body: TrackEventRequest,
    ): Response<TrackEventResponse>
}
