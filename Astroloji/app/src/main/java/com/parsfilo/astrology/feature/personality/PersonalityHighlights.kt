package com.parsfilo.astrology.feature.personality

import com.parsfilo.astrology.core.domain.model.PersonalityReport
import com.parsfilo.astrology.core.util.ZodiacSign

internal data class PersonalityHighlights(
    val strengths: List<String>,
    val partners: List<String>,
) {
    val hasContent: Boolean get() = strengths.isNotEmpty() || partners.isNotEmpty()
}

/**
 * Missing collections in free responses are intentional: backend excludes premium-only lists.
 * Never show an empty title or infer undisclosed content from local zodiac seeds.
 */
internal fun visiblePersonalityHighlights(report: PersonalityReport): PersonalityHighlights =
    PersonalityHighlights(
        strengths = report.strengths.filter(String::isNotBlank),
        partners =
            report.idealPartners
                .filter(String::isNotBlank)
                .map { key ->
                    ZodiacSign.entries.firstOrNull { it.key == key }?.localizedName(report.language) ?: key
                },
    )
