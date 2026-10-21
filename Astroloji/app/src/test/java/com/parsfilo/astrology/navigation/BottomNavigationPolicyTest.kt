package com.parsfilo.astrology.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import kotlin.reflect.KClass

class BottomNavigationPolicyTest {
    @Test
    fun `home and all home child routes highlight the Home tab`() {
        val homeRoutes: List<KClass<*>> =
            listOf(
                HomeRoute::class,
                DailyDetailRoute::class,
                WeeklyRoute::class,
                MonthlyRoute::class,
                PersonalityRoute::class,
            )

        for (route in homeRoutes) {
            assertThat(isHomeTabDestination { it == route }).isTrue()
        }
    }

    @Test
    fun `unrelated bottom tabs do not highlight Home`() {
        val unrelatedRoutes: List<KClass<*>> =
            listOf(SettingsRoute::class, CompatibilityRoute::class, PremiumRoute::class)

        for (route in unrelatedRoutes) {
            assertThat(isHomeTabDestination { it == route }).isFalse()
        }
    }

    @Test
    fun `home tab never restores a stale child back stack`() {
        assertThat(shouldRestoreBottomTabState(HomeRoute)).isFalse()
        assertThat(shouldRestoreBottomTabState(SettingsRoute)).isTrue()
        assertThat(shouldRestoreBottomTabState(CompatibilityRoute)).isTrue()
        assertThat(shouldRestoreBottomTabState(PremiumRoute(PaywallSource.NAV))).isTrue()
    }
}
