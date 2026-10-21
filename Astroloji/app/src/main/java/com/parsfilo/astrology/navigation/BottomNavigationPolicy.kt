package com.parsfilo.astrology.navigation

import kotlin.reflect.KClass

/**
 * Home child screens belong to the Home tab, even when their destination is not HomeRoute.
 * Kept independent of Compose so it can be checked without navigating real user data.
 */
internal fun isHomeTabDestination(hasRoute: (KClass<*>) -> Boolean): Boolean =
    listOf(
        HomeRoute::class,
        DailyDetailRoute::class,
        WeeklyRoute::class,
        MonthlyRoute::class,
        PersonalityRoute::class,
    ).any(hasRoute)

/**
 * Home always opens its dashboard. Other tabs keep the existing independent back-stack behavior.
 */
internal fun shouldRestoreBottomTabState(route: Any): Boolean = route != HomeRoute
