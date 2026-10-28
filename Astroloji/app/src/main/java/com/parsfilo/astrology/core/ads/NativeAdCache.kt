package com.parsfilo.astrology.core.ads

import com.google.android.gms.ads.nativead.NativeAd
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class NativeLoadToken(
    val consentRevision: Long,
    val generation: Long,
)

/**
 * The SDK does not cancel a native load when privacy options change.
 * Never expose or retain an ad whose request was made under older consent.
 */
internal class NativeAdCache(
    private val canRequestAds: () -> Boolean,
    private val consentRevision: () -> Long,
) {
    private val _ad = MutableStateFlow<NativeAd?>(null)
    val ad: StateFlow<NativeAd?> = _ad.asStateFlow()

    private var loadedRevision = Long.MIN_VALUE
    private var generation = 0L
    private var loading = false

    fun beginLoad(): NativeLoadToken? {
        discardIfStale()
        if (loading || _ad.value != null || !canRequestAds()) return null
        loading = true
        return NativeLoadToken(consentRevision(), ++generation)
    }

    fun loaded(
        token: NativeLoadToken,
        creative: NativeAd,
    ): Boolean {
        if (!loading || token.generation != generation) {
            creative.destroy()
            return false
        }
        loading = false
        val permitted = canRequestAds() && consentRevision() == token.consentRevision
        if (permitted) {
            _ad.value?.destroy()
            _ad.value = creative
            loadedRevision = token.consentRevision
        } else {
            creative.destroy()
        }
        return permitted
    }

    fun failed(token: NativeLoadToken) {
        if (token.generation == generation) loading = false
    }

    fun discardIfStale() {
        if (_ad.value != null && (!canRequestAds() || loadedRevision != consentRevision())) {
            _ad.value?.destroy()
            _ad.value = null
            loadedRevision = Long.MIN_VALUE
        }
    }

    /** Invalidate pending callbacks too; an explicit clear must not be undone. */
    fun clear() {
        generation += 1
        loading = false
        _ad.value?.destroy()
        _ad.value = null
        loadedRevision = Long.MIN_VALUE
    }
}
