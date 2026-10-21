package com.parsfilo.astrology.feature.personality

import com.google.common.truth.Truth.assertThat
import com.parsfilo.astrology.core.domain.model.PersonalityReport
import org.junit.Test

class PersonalityHighlightsTest {
    @Test
    fun freeResponseHasNoEmptySection() {
        val free = report(strengths = emptyList(), partners = emptyList())
        val sections = visiblePersonalityHighlights(free)

        assertThat(sections.hasContent).isFalse()
        assertThat(sections.strengths).isEmpty()
        assertThat(sections.partners).isEmpty()
    }

    @Test
    fun partialResponseKeepsRealStrengthsButNotWhitespace() {
        val partial = report(strengths = listOf("", "Kararlı", "  "), partners = emptyList())
        val sections = visiblePersonalityHighlights(partial)

        assertThat(sections.hasContent).isTrue()
        assertThat(sections.strengths).containsExactly("Kararlı")
        assertThat(sections.partners).isEmpty()
    }

    @Test
    fun premiumPartnerKeysAreLocalizedWithoutInventingUnknownSigns() {
        val premium = report(strengths = listOf("Kararlı"), partners = listOf("leo", "capricorn", "unknown"))
        val sections = visiblePersonalityHighlights(premium)

        assertThat(sections.hasContent).isTrue()
        assertThat(sections.partners).containsExactly("Aslan", "Oğlak", "unknown").inOrder()
    }

    private fun report(
        strengths: List<String>,
        partners: List<String>,
    ) = PersonalityReport(
        sign = "taurus",
        language = "tr",
        summary = "Güvenilir",
        deepAnalysis = null,
        strengths = strengths,
        weaknesses = emptyList(),
        idealPartners = partners,
        careerFit = emptyList(),
        element = "toprak",
        planet = "Venüs",
        color = "yeşil",
        stone = "zümrüt",
    )
}
