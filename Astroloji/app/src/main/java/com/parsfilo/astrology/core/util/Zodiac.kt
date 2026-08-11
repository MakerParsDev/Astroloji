package com.parsfilo.astrology.core.util

import androidx.annotation.DrawableRes
import androidx.compose.ui.graphics.Color
import com.parsfilo.astrology.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

enum class ZodiacElement(
    val nameTr: String,
    val nameEn: String,
    val nameEs: String,
    val namePt: String,
    val nameDe: String,
    val color: Color,
) {
    FIRE("Ateş", "Fire", "Fuego", "Fogo", "Feuer", Color(0xFFE8593C)),
    EARTH("Toprak", "Earth", "Tierra", "Terra", "Erde", Color(0xFF8B7355)),
    AIR("Hava", "Air", "Aire", "Ar", "Luft", Color(0xFF5B9BD5)),
    WATER("Su", "Water", "Agua", "Água", "Wasser", Color(0xFF4A90A4)),
}

@Suppress("LongParameterList", "MagicNumber")
enum class ZodiacSign(
    val key: String,
    val nameTr: String,
    val nameEn: String,
    val nameEs: String,
    val namePt: String,
    val nameDe: String,
    val symbol: String,
    private val startMonth: Int,
    private val startDay: Int,
    private val endMonth: Int,
    private val endDay: Int,
    val element: ZodiacElement,
    val planet: String,
    @param:DrawableRes val iconRes: Int,
) {
    ARIES(
        "aries",
        "Koç",
        "Aries",
        "Aries",
        "Áries",
        "Widder",
        "♈",
        3,
        21,
        4,
        19,
        ZodiacElement.FIRE,
        "Mars",
        R.drawable.ic_zodiac_generic,
    ),
    TAURUS(
        "taurus",
        "Boğa",
        "Taurus",
        "Tauro",
        "Touro",
        "Stier",
        "♉",
        4,
        20,
        5,
        20,
        ZodiacElement.EARTH,
        "Venüs",
        R.drawable.ic_zodiac_generic,
    ),
    GEMINI(
        "gemini",
        "İkizler",
        "Gemini",
        "Géminis",
        "Gêmeos",
        "Zwillinge",
        "♊",
        5,
        21,
        6,
        20,
        ZodiacElement.AIR,
        "Merkür",
        R.drawable.ic_zodiac_generic,
    ),
    CANCER(
        "cancer",
        "Yengeç",
        "Cancer",
        "Cáncer",
        "Câncer",
        "Krebs",
        "♋",
        6,
        21,
        7,
        22,
        ZodiacElement.WATER,
        "Ay",
        R.drawable.ic_zodiac_generic,
    ),
    LEO(
        "leo",
        "Aslan",
        "Leo",
        "Leo",
        "Leão",
        "Löwe",
        "♌",
        7,
        23,
        8,
        22,
        ZodiacElement.FIRE,
        "Güneş",
        R.drawable.ic_zodiac_generic,
    ),
    VIRGO(
        "virgo",
        "Başak",
        "Virgo",
        "Virgo",
        "Virgem",
        "Jungfrau",
        "♍",
        8,
        23,
        9,
        22,
        ZodiacElement.EARTH,
        "Merkür",
        R.drawable.ic_zodiac_generic,
    ),
    LIBRA(
        "libra",
        "Terazi",
        "Libra",
        "Libra",
        "Libra",
        "Waage",
        "♎",
        9,
        23,
        10,
        22,
        ZodiacElement.AIR,
        "Venüs",
        R.drawable.ic_zodiac_generic,
    ),
    SCORPIO(
        "scorpio",
        "Akrep",
        "Scorpio",
        "Escorpio",
        "Escorpião",
        "Skorpion",
        "♏",
        10,
        23,
        11,
        21,
        ZodiacElement.WATER,
        "Plüton",
        R.drawable.ic_zodiac_generic,
    ),
    SAGITTARIUS(
        "sagittarius",
        "Yay",
        "Sagittarius",
        "Sagitario",
        "Sagitário",
        "Schütze",
        "♐",
        11,
        22,
        12,
        21,
        ZodiacElement.FIRE,
        "Jüpiter",
        R.drawable.ic_zodiac_generic,
    ),
    CAPRICORN(
        "capricorn",
        "Oğlak",
        "Capricorn",
        "Capricornio",
        "Capricórnio",
        "Steinbock",
        "♑",
        12,
        22,
        1,
        19,
        ZodiacElement.EARTH,
        "Satürn",
        R.drawable.ic_zodiac_generic,
    ),
    AQUARIUS(
        "aquarius",
        "Kova",
        "Aquarius",
        "Acuario",
        "Aquário",
        "Wassermann",
        "♒",
        1,
        20,
        2,
        18,
        ZodiacElement.AIR,
        "Uranüs",
        R.drawable.ic_zodiac_generic,
    ),
    PISCES(
        "pisces",
        "Balık",
        "Pisces",
        "Piscis",
        "Peixes",
        "Fische",
        "♓",
        2,
        19,
        3,
        20,
        ZodiacElement.WATER,
        "Neptün",
        R.drawable.ic_zodiac_generic,
    ),
    ;

    fun localizedName(language: String): String =
        when (TimeUtils.normalizeLanguageTag(language)) {
            "tr" -> nameTr
            "es" -> nameEs
            "pt" -> namePt
            "de" -> nameDe
            else -> nameEn
        }

    val dateRange: String
        get() = localizedDateRange("tr")

    fun localizedDateRange(language: String): String {
        val locale =
            when (TimeUtils.normalizeLanguageTag(language)) {
                "tr" -> Locale.forLanguageTag("tr-TR")
                "es" -> Locale.forLanguageTag("es-ES")
                "pt" -> Locale.forLanguageTag("pt-BR")
                "de" -> Locale.forLanguageTag("de-DE")
                else -> Locale.ENGLISH
            }
        val formatter = DateTimeFormatter.ofPattern("d MMM", locale)
        val startDate = LocalDate.of(2000, startMonth, startDay)
        val endDate = LocalDate.of(2000, endMonth, endDay)
        return "${startDate.format(formatter)} - ${endDate.format(formatter)}"
    }

    companion object {
        fun fromKey(key: String): ZodiacSign = entries.first { it.key == key }

        fun fromKeyOrNull(key: String?): ZodiacSign? = entries.firstOrNull { it.key == key }

        fun fromBirthDate(date: LocalDate): ZodiacSign =
            when {
                matches(date, 3, 21, 4, 19) -> ARIES
                matches(date, 4, 20, 5, 20) -> TAURUS
                matches(date, 5, 21, 6, 20) -> GEMINI
                matches(date, 6, 21, 7, 22) -> CANCER
                matches(date, 7, 23, 8, 22) -> LEO
                matches(date, 8, 23, 9, 22) -> VIRGO
                matches(date, 9, 23, 10, 22) -> LIBRA
                matches(date, 10, 23, 11, 21) -> SCORPIO
                matches(date, 11, 22, 12, 21) -> SAGITTARIUS
                matches(date, 12, 22, 1, 19) -> CAPRICORN
                matches(date, 1, 20, 2, 18) -> AQUARIUS
                else -> PISCES
            }

        fun fromBirthDateMillis(millis: Long): ZodiacSign {
            val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
            return fromBirthDate(date)
        }

        private fun matches(
            date: LocalDate,
            startMonth: Int,
            startDay: Int,
            endMonth: Int,
            endDay: Int,
        ): Boolean {
            val month = date.monthValue
            val day = date.dayOfMonth
            return if (startMonth <= endMonth) {
                (month > startMonth || (month == startMonth && day >= startDay)) &&
                    (month < endMonth || (month == endMonth && day <= endDay))
            } else {
                (month > startMonth || (month == startMonth && day >= startDay)) ||
                    (month < endMonth || (month == endMonth && day <= endDay))
            }
        }
    }
}
