package com.parsfilo.astrology.core.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.LocalDate

class StreakTrackerTest {
    @Test
    fun `keeps consecutive streaks and awards new milestones`() {
        val result =
            StreakTracker.update(
                previousDate = "2026-04-09",
                previousCount = 13,
                today = LocalDate.parse("2026-04-10"),
                utcOffset = 3,
            )

        assertThat(result.count).isEqualTo(14)
        assertThat(result.achievedMilestone).isEqualTo(14)
    }

    @Test
    fun `resets the streak when the local user date skips a day`() {
        val result =
            StreakTracker.update(
                previousDate = "2026-04-07",
                previousCount = 7,
                today = LocalDate.parse("2026-04-10"),
                utcOffset = -5,
            )

        assertThat(result.count).isEqualTo(1)
        assertThat(result.achievedMilestone).isNull()
    }
}
