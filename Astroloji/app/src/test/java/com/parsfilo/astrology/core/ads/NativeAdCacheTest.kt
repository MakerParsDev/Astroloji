package com.parsfilo.astrology.core.ads

import com.google.android.gms.ads.nativead.NativeAd
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test

class NativeAdCacheTest {
    private var allowed = true
    private var revision = 1L
    private val cache = NativeAdCache({ allowed }, { revision })

    @Test
    fun rejectsLoadedCreativeWhenConsentRevisionChangedEvenIfPermissionStaysTrue() {
        val token = cache.beginLoad()!!
        revision = 2L
        val obsolete = mockk<NativeAd>(relaxed = true)

        assertThat(cache.loaded(token, obsolete)).isFalse()
        assertThat(cache.ad.value).isNull()
        verify(exactly = 1) { obsolete.destroy() }

        val fresh = mockk<NativeAd>(relaxed = true)
        assertThat(cache.loaded(cache.beginLoad()!!, fresh)).isTrue()
        assertThat(cache.ad.value).isSameInstanceAs(fresh)
    }

    @Test
    fun rejectsCreativeLoadedAfterPermissionRevocation() {
        val token = cache.beginLoad()!!
        allowed = false
        val ad = mockk<NativeAd>(relaxed = true)

        assertThat(cache.loaded(token, ad)).isFalse()
        assertThat(cache.ad.value).isNull()
        assertThat(cache.beginLoad()).isNull()
        verify(exactly = 1) { ad.destroy() }
    }

    @Test
    fun evictsCachedCreativeAfterConsentRevisionOrRevocation() {
        val first = mockk<NativeAd>(relaxed = true)
        assertThat(cache.loaded(cache.beginLoad()!!, first)).isTrue()
        revision = 2L

        val next = cache.beginLoad()
        assertThat(next).isNotNull()
        assertThat(cache.ad.value).isNull()
        verify(exactly = 1) { first.destroy() }

        val second = mockk<NativeAd>(relaxed = true)
        assertThat(cache.loaded(next!!, second)).isTrue()
        allowed = false
        cache.discardIfStale()
        assertThat(cache.ad.value).isNull()
        verify(exactly = 1) { second.destroy() }
    }

    @Test
    fun explicitClearInvalidatesLateCallbackEvenWhenPermissionUnchanged() {
        val obsoleteToken = cache.beginLoad()!!
        cache.clear()

        val newToken = cache.beginLoad()!!
        val obsolete = mockk<NativeAd>(relaxed = true)
        assertThat(cache.loaded(obsoleteToken, obsolete)).isFalse()
        verify(exactly = 1) { obsolete.destroy() }

        val current = mockk<NativeAd>(relaxed = true)
        assertThat(cache.loaded(newToken, current)).isTrue()
        assertThat(cache.ad.value).isSameInstanceAs(current)
        cache.clear()
        verify(exactly = 1) { current.destroy() }
    }

    @Test
    fun lateFailureDoesNotCancelNewInFlightLoad() {
        val obsoleteToken = cache.beginLoad()!!
        cache.clear()
        val currentToken = cache.beginLoad()!!
        cache.failed(obsoleteToken)

        assertThat(cache.beginLoad()).isNull()
        val current = mockk<NativeAd>(relaxed = true)
        assertThat(cache.loaded(currentToken, current)).isTrue()
        assertThat(cache.ad.value).isSameInstanceAs(current)
    }
}
