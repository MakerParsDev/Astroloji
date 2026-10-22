package com.parsfilo.astrology

/** Android's light-status-bar flag means dark icons; it is the inverse of a dark app surface. */
internal fun shouldUseDarkStatusBarIcons(darkAppTheme: Boolean): Boolean = !darkAppTheme
