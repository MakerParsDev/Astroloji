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

data class VedicChart(
    val version: String,
    val calculationVersion: String,
    val timeCertainty: String,
    val ayanamsa: Double,
    val positions: List<SiderealPosition>,
    val moonNakshatra: MoonNakshatra,
    val mahadashas: List<Mahadasha>,
    val limitations: List<String>,
)

data class SiderealPosition(
    val body: String,
    val longitude: Double,
    val signKey: String,
    val degreeInSign: Double,
)

data class MoonNakshatra(
    val nakshatra: String,
    val index: Int,
    val pada: Int,
)

data class Mahadasha(
    val graha: String,
    val startDate: String,
    val endDate: String,
    val years: Double,
)
