package com.parsfilo.astrology.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.parsfilo.astrology.core.data.preferences.UserPreferencesRepository
import com.parsfilo.astrology.feature.compatibility.CompatibilityScreen
import com.parsfilo.astrology.feature.daily.DailyScreen
import com.parsfilo.astrology.feature.home.HomeScreen
import com.parsfilo.astrology.feature.monthly.MonthlyScreen
import com.parsfilo.astrology.feature.onboarding.OnboardingScreen
import com.parsfilo.astrology.feature.personality.PersonalityScreen
import com.parsfilo.astrology.feature.premium.PremiumScreen
import com.parsfilo.astrology.feature.settings.SettingsScreen
import com.parsfilo.astrology.feature.weekly.WeeklyScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@Composable
fun AstrologyAppRoot(
    deepLink: AppDeepLink? = null,
    onDeepLinkConsumed: () -> Unit = {},
    viewModel: RootViewModel = hiltViewModel(),
) {
    val startDestination by viewModel.startDestination.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    val isBottomBarVisible = currentDestination?.hasRoute(OnboardingRoute::class) != true

    LaunchedEffect(deepLink, startDestination) {
        val target = deepLink ?: return@LaunchedEffect
        if (startDestination == OnboardingRoute) {
            return@LaunchedEffect
        }
        if (target.type == "daily" && !target.sign.isNullOrBlank()) {
            navController.navigate(DailyDetailRoute(target.sign)) {
                launchSingleTop = true
            }
            onDeepLinkConsumed()
        }
    }

    Scaffold(
        bottomBar = {
            if (isBottomBarVisible) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
                    tonalElevation = 0.dp,
                ) {
                    val items =
                        listOf(
                            BottomItem(HomeRoute, stringResource(com.parsfilo.astrology.R.string.nav_home), Icons.Outlined.Home),
                            BottomItem(
                                CompatibilityRoute,
                                stringResource(com.parsfilo.astrology.R.string.nav_compatibility),
                                Icons.Outlined.AutoAwesome,
                            ),
                            BottomItem(SettingsRoute, stringResource(com.parsfilo.astrology.R.string.nav_profile), Icons.Outlined.Person),
                            BottomItem(
                                PremiumRoute(PaywallSource.NAV),
                                stringResource(com.parsfilo.astrology.R.string.nav_premium),
                                Icons.Outlined.Star,
                            ),
                        )
                    items.forEach { item ->
                        NavigationBarItem(
                            selected = currentDestination?.hasRoute(item.route::class) == true,
                            onClick = {
                                navController.navigate(item.route) {
                                    launchSingleTop = true
                                    restoreState = true
                                    popUpTo(navController.graph.startDestinationId) { saveState = true }
                                }
                            },
                            colors =
                                NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.secondary,
                                    selectedTextColor = MaterialTheme.colorScheme.secondary,
                                    indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f),
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
        ) {
            composable<OnboardingRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                OnboardingScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    onComplete = {
                        navController.navigate(HomeRoute) {
                            popUpTo(OnboardingRoute) { inclusive = true }
                        }
                    },
                )
            }
            composable<HomeRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                HomeScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    onOpenDaily = { navController.navigate(DailyDetailRoute(it)) },
                    onOpenWeekly = { navController.navigate(WeeklyRoute(it)) },
                    onOpenMonthly = { navController.navigate(MonthlyRoute(it)) },
                    onOpenPersonality = { navController.navigate(PersonalityRoute(it)) },
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.DAILY_LOCK)) },
                )
            }
            composable<CompatibilityRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                CompatibilityScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.COMPATIBILITY_LOCK)) },
                )
            }
            composable<SettingsRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                SettingsScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.PROFILE_UPGRADE)) },
                    onAccountDeleted = {
                        navController.navigate(OnboardingRoute) {
                            popUpTo(navController.graph.startDestinationId) { inclusive = true }
                            launchSingleTop = true
                        }
                    },
                )
            }
            composable<PremiumRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) { backStackEntry ->
                val route = backStackEntry.toRoute<PremiumRoute>()
                PremiumScreen(
                    source = route.source.analyticsValue,
                    onContinueFree = {
                        if (!navController.popBackStack()) {
                            navController.navigate(HomeRoute) { launchSingleTop = true }
                        }
                    },
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                )
            }
            composable<DailyDetailRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                DailyScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    sign = it.toRoute<DailyDetailRoute>().sign,
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.DAILY_LOCK)) },
                )
            }
            composable<WeeklyRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                WeeklyScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    sign = it.toRoute<WeeklyRoute>().sign,
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.WEEKLY_LOCK)) },
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable<MonthlyRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                MonthlyScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    sign = it.toRoute<MonthlyRoute>().sign,
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.MONTHLY_LOCK)) },
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable<PersonalityRoute>(
                enterTransition = { fadeIn(animationSpec = tween(300)) },
                exitTransition = { fadeOut(animationSpec = tween(200)) },
            ) {
                PersonalityScreen(
                    modifier =
                        androidx.compose.ui.Modifier
                            .padding(padding),
                    sign = it.toRoute<PersonalityRoute>().sign,
                    onOpenPremium = { navController.navigate(PremiumRoute(PaywallSource.PERSONALITY_LOCK)) },
                )
            }
        }
    }
}

private data class BottomItem<T : Any>(
    val route: T,
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)

@HiltViewModel
class RootViewModel
    @Inject
    constructor(
        preferencesRepository: UserPreferencesRepository,
    ) : ViewModel() {
        val startDestination =
            preferencesRepository.preferences
                .map { if (it.onboardingCompleted) HomeRoute else OnboardingRoute }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OnboardingRoute)
    }
