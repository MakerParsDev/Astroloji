package com.parsfilo.astrology.core.domain.model

data class PersonalGuidance(
    val version: String,
    val calculationVersion: String,
    val generatedAt: String,
    val targetTimestamp: String,
    val language: String,
    val signals: List<GuidanceSignal>,
    val limitations: List<String>,
    val disclaimer: String,
)

data class GuidanceSignal(
    val id: String,
    val priority: Int,
    val domain: String,
    val title: String,
    val summary: String,
    val actionPrompt: String,
    val evidence: GuidanceEvidence,
)

data class GuidanceEvidence(
    val transitBody: String,
    val natalBody: String,
    val aspect: String,
    val orb: Double,
    val maximumOrb: Double,
)
