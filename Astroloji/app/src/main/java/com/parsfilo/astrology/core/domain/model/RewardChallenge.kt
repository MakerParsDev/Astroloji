package com.parsfilo.astrology.core.domain.model

data class RewardChallenge(
    val challengeId: String,
    val customData: String,
    val userId: String,
    val rewardType: String,
    val identifier: String,
    val expiresAt: String,
)
