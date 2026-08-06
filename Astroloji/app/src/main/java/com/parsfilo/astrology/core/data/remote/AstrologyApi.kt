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

    @POST("api/v1/events/track")
    suspend fun trackEvent(
        @Body body: TrackEventRequest,
    ): Response<TrackEventResponse>
}
