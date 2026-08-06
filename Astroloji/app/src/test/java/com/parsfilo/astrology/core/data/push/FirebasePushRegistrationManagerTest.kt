package com.parsfilo.astrology.core.data.push

import com.google.android.gms.tasks.Tasks
import com.google.common.truth.Truth.assertThat
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.io.IOException

class FirebasePushRegistrationManagerTest {
    private val messaging = mockk<FirebaseMessaging>()
    private val installations = mockk<FirebaseInstallations>()

    @Test
    fun `register enables FID delivery and returns the installation id`() =
        runTest {
            every { messaging.register() } returns Tasks.forResult(null)
            every { installations.id } returns Tasks.forResult("fid-123")
            val manager = FirebasePushRegistrationManager(messaging, installations)

            val result = manager.register()

            assertThat(result).isEqualTo("fid-123")
            verify(ordering = io.mockk.Ordering.SEQUENCE) {
                messaging.register()
                installations.id
            }
        }

    @Test
    fun `installation deletion still runs when messaging unregister fails`() =
        runTest {
            every { messaging.unregister() } returns Tasks.forException(IOException("offline"))
            every { installations.delete() } returns Tasks.forResult(null)
            val manager = FirebasePushRegistrationManager(messaging, installations)
            var failure: Throwable? = null

            try {
                manager.unregister()
            } catch (exception: Throwable) {
                failure = exception
            }

            assertThat(failure).isInstanceOf(IOException::class.java)
            verify(exactly = 1) { messaging.unregister() }
            verify(exactly = 1) { installations.delete() }
        }

    @Test
    fun `unregister disables delivery before deleting the installation`() =
        runTest {
            every { messaging.unregister() } returns Tasks.forResult(null)
            every { installations.delete() } returns Tasks.forResult(null)
            val manager = FirebasePushRegistrationManager(messaging, installations)

            manager.unregister()

            verify(ordering = io.mockk.Ordering.SEQUENCE) {
                messaging.unregister()
                installations.delete()
            }
        }
}
