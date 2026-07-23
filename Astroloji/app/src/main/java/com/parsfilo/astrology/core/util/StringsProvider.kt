package com.parsfilo.astrology.core.util

import android.content.Context
import androidx.annotation.StringRes
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StringsProvider
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) {
        fun get(
            @StringRes resId: Int,
            vararg args: Any,
        ): String = context.getString(resId, *args)
    }
