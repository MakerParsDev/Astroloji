import com.android.build.api.dsl.ApplicationExtension
import com.github.triplet.gradle.androidpublisher.ReleaseStatus

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose.screenshot) apply false
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
    alias(libs.plugins.firebase.crashlytics)
    alias(libs.plugins.room)
    alias(libs.plugins.detekt)
    alias(libs.plugins.ktlint)
    alias(libs.plugins.play.publisher)
}

val screenshotTestsEnabled =
    providers.gradleProperty("android.experimental.enableScreenshotTest").orNull == "true"

if (screenshotTestsEnabled) {
    extensions.configure<ApplicationExtension> {
        experimentalProperties["android.experimental.enableScreenshotTest"] = true
    }
    apply(plugin = "com.android.compose.screenshot")
}

fun stringConfig(
    name: String,
    defaultValue: String,
): String =
    providers.gradleProperty(name).orNull?.takeIf { it.isNotBlank() }
        ?: providers.environmentVariable(name).orNull?.takeIf { it.isNotBlank() }
        ?: defaultValue

fun optionalStringConfig(name: String): String? =
    providers.gradleProperty(name).orNull?.takeIf { it.isNotBlank() }
        ?: providers.environmentVariable(name).orNull?.takeIf { it.isNotBlank() }

fun intConfig(
    name: String,
    defaultValue: Int,
): Int = providers.gradleProperty(name).orNull?.toIntOrNull() ?: defaultValue

fun optionalDoubleConfig(name: String): Double? = providers.gradleProperty(name).orNull?.toDoubleOrNull()

fun playReleaseStatusConfig(
    name: String,
    defaultValue: ReleaseStatus,
): ReleaseStatus {
    val configuredValue =
        providers
            .gradleProperty(name)
            .orNull
            ?.trim()
            ?.uppercase()

    return when (configuredValue) {
        null, "" -> defaultValue
        "COMPLETED" -> ReleaseStatus.COMPLETED
        "DRAFT" -> ReleaseStatus.DRAFT
        "HALTED" -> ReleaseStatus.HALTED
        "IN_PROGRESS", "INPROGRESS" -> ReleaseStatus.IN_PROGRESS
        else -> error("Unsupported Play release status for '$name'.")
    }
}

val releaseKeystorePath = optionalStringConfig("ANDROID_KEYSTORE_PATH")
val releaseKeystorePassword = optionalStringConfig("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = optionalStringConfig("ANDROID_KEY_ALIAS")
val releaseKeyPassword = optionalStringConfig("ANDROID_KEY_PASSWORD")
val releaseAdMobAppId = optionalStringConfig("ADMOB_APP_ID")
val releaseAdMobBannerId = optionalStringConfig("ADMOB_BANNER_ID")
val releaseAdMobInterstitialId = optionalStringConfig("ADMOB_INTERSTITIAL_ID")
val releaseAdMobRewardedId = optionalStringConfig("ADMOB_REWARDED_ID")
val releaseAdMobRewardedInterstitialId = optionalStringConfig("ADMOB_REWARDED_INTERSTITIAL_ID")
val releaseAdMobAppOpenId = optionalStringConfig("ADMOB_APP_OPEN_ID")
val releaseAdMobNativeAdvancedId = optionalStringConfig("ADMOB_NATIVE_ADVANCED_ID")
val playReleaseName = optionalStringConfig("PLAY_RELEASE_NAME")
val hasReleaseSigning =
    listOf(
        releaseKeystorePath,
        releaseKeystorePassword,
        releaseKeyAlias,
        releaseKeyPassword,
    ).all { !it.isNullOrBlank() }
val releaseLikeBuildRequested =
    gradle.startParameter.taskNames.any { taskName ->
        taskName.contains("release", ignoreCase = true) ||
            taskName.contains("publish", ignoreCase = true)
    }
val missingReleaseAdMobKeys =
    buildList {
        if (releaseAdMobAppId.isNullOrBlank()) add("ADMOB_APP_ID")
        if (releaseAdMobBannerId.isNullOrBlank()) add("ADMOB_BANNER_ID")
        if (releaseAdMobInterstitialId.isNullOrBlank()) add("ADMOB_INTERSTITIAL_ID")
        if (releaseAdMobRewardedId.isNullOrBlank()) add("ADMOB_REWARDED_ID")
        if (releaseAdMobRewardedInterstitialId.isNullOrBlank()) add("ADMOB_REWARDED_INTERSTITIAL_ID")
        if (releaseAdMobAppOpenId.isNullOrBlank()) add("ADMOB_APP_OPEN_ID")
        if (releaseAdMobNativeAdvancedId.isNullOrBlank()) add("ADMOB_NATIVE_ADVANCED_ID")
    }

if (releaseLikeBuildRequested && missingReleaseAdMobKeys.isNotEmpty()) {
    error(
        "Release-like builds require AdMob secrets. Missing: ${missingReleaseAdMobKeys.joinToString(", ")}",
    )
}

val screenshotRuntimeExcludedGroups =
    setOf(
        "com.android.billingclient",
        "com.google.android.gms",
        "com.google.android.play",
        "com.google.android.ump",
        "com.google.firebase",
    )

configurations.configureEach {
    if (name.contains("ScreenshotTest", ignoreCase = true)) {
        screenshotRuntimeExcludedGroups.forEach { group -> exclude(group = group) }
    }
}

android {
    namespace = "com.parsfilo.astrology"
    compileSdk = 37

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = requireNotNull(releaseKeystorePassword)
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    defaultConfig {
        applicationId = "com.parsfilo.astrology"
        minSdk = 24
        targetSdk = 37
        versionCode = intConfig("VERSION_CODE", 1)
        versionName = stringConfig("VERSION_NAME", "1.0")

        testInstrumentationRunner = "com.parsfilo.astrology.HiltTestRunner"

        buildConfigField(
            "String",
            "BASE_URL",
            "\"https://astrology.parsfilo.com/\"",
        )
        buildConfigField("String", "API_PREFIX", "\"api/v1/\"")
        buildConfigField(
            "String",
            "PRIVACY_POLICY_URL",
            "\"${stringConfig("PRIVACY_POLICY_URL", "https://astrology.parsfilo.com/privacy")}\"",
        )
        buildConfigField(
            "String",
            "TERMS_OF_USE_URL",
            "\"${stringConfig("TERMS_OF_USE_URL", "https://astrology.parsfilo.com/terms")}\"",
        )
        buildConfigField(
            "String",
            "SUPPORT_EMAIL",
            "\"${stringConfig("SUPPORT_EMAIL", "info@parsfilo.com")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_APP_ID",
            "\"${stringConfig("ADMOB_APP_ID", "")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_BANNER_ID",
            "\"${stringConfig("ADMOB_BANNER_ID", "")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_INTERSTITIAL_ID",
            "\"${stringConfig("ADMOB_INTERSTITIAL_ID", "")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_REWARDED_ID",
            "\"${stringConfig("ADMOB_REWARDED_ID", "")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_REWARDED_INTERSTITIAL_ID",
            "\"${stringConfig("ADMOB_REWARDED_INTERSTITIAL_ID", "")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_APP_OPEN_ID",
            "\"${stringConfig("ADMOB_APP_OPEN_ID", "")}\"",
        )
        buildConfigField(
            "String",
            "ADMOB_NATIVE_ADVANCED_ID",
            "\"${stringConfig("ADMOB_NATIVE_ADVANCED_ID", "")}\"",
        )
        buildConfigField(
            "boolean",
            "ADMOB_USE_TEST_IDS",
            stringConfig("ADMOB_USE_TEST_IDS", "false"),
        )
        buildConfigField("boolean", "STORE_SCREENSHOT_QA", "false")
        manifestPlaceholders["ADMOB_APP_ID"] =
            stringConfig(
                "ADMOB_APP_ID",
                "",
            )
    }

    buildTypes {
        debug {
            isDebuggable = true
            buildConfigField("String", "ADMOB_APP_ID", "\"ca-app-pub-3940256099942544~3347511713\"")
            buildConfigField("String", "ADMOB_BANNER_ID", "\"ca-app-pub-3940256099942544/9214589741\"")
            buildConfigField("String", "ADMOB_INTERSTITIAL_ID", "\"ca-app-pub-3940256099942544/1033173712\"")
            buildConfigField("String", "ADMOB_REWARDED_ID", "\"ca-app-pub-3940256099942544/5224354917\"")
            buildConfigField("String", "ADMOB_REWARDED_INTERSTITIAL_ID", "\"ca-app-pub-3940256099942544/5354046379\"")
            buildConfigField("String", "ADMOB_APP_OPEN_ID", "\"ca-app-pub-3940256099942544/9257395921\"")
            buildConfigField("String", "ADMOB_NATIVE_ADVANCED_ID", "\"ca-app-pub-3940256099942544/2247696110\"")
            buildConfigField("boolean", "ADMOB_USE_TEST_IDS", "true")
            manifestPlaceholders["ADMOB_APP_ID"] = "ca-app-pub-3940256099942544~3347511713"
//            applicationIdSuffix = ".debug"
//            versionNameSuffix = "-debug"
        }
        create("storeQa") {
            initWith(getByName("debug"))
            matchingFallbacks += listOf("debug")
            applicationIdSuffix = ".storeqa"
            versionNameSuffix = "-storeqa"
            isDebuggable = true
            buildConfigField("boolean", "STORE_SCREENSHOT_QA", "true")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            buildConfigField("boolean", "ADMOB_USE_TEST_IDS", "false")
            manifestPlaceholders["ADMOB_APP_ID"] = releaseAdMobAppId ?: ""
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    sourceSets.named("storeQa") {
        kotlin.directories += "src/debug/java"
    }

    if (screenshotTestsEnabled) {
        sourceSets.named("debug") {
            res.directories += "src/screenshotTest/res"
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        warningsAsErrors = true
    }
}
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21
        optIn.addAll(
            "androidx.compose.material3.ExperimentalMaterial3Api",
            "androidx.compose.foundation.ExperimentalFoundationApi",
            "kotlinx.coroutines.ExperimentalCoroutinesApi",
        )
    }
}

room {
    schemaDirectory("$projectDir/schemas")
}

play {
    defaultToAppBundles.set(true)
    track.set(stringConfig("PLAY_TRACK", "internal"))
    releaseStatus.set(playReleaseStatusConfig("PLAY_RELEASE_STATUS", ReleaseStatus.COMPLETED))
    optionalDoubleConfig("PLAY_USER_FRACTION")?.let { fraction ->
        userFraction.set(fraction)
    }
    playReleaseName?.let { configuredReleaseName ->
        releaseName.set(configuredReleaseName)
    }
    optionalStringConfig("PLAY_SERVICE_ACCOUNT_JSON_PATH")?.let { credentialsPath ->
        serviceAccountCredentials.set(file(credentialsPath))
    }
}

tasks.matching { it.name == "uploadCrashlyticsMappingFileRelease" }.configureEach {
    onlyIf { stringConfig("CRASHLYTICS_MAPPING_UPLOAD_ENABLED", "true").toBoolean() }
}

val prepareDebugGoogleServices =
    tasks.register("prepareDebugGoogleServices") {
        description = "Copies the example google-services config for local debug/test verification."
        val sourceFile = layout.projectDirectory.file("google-services.example.json")
        val targetFile = layout.projectDirectory.file("google-services.json")
        inputs.file(sourceFile)
        outputs.file(targetFile)
        onlyIf {
            !releaseLikeBuildRequested &&
                !targetFile.asFile.exists() &&
                sourceFile.asFile.exists()
        }
        doLast {
            copy {
                from(sourceFile)
                into(layout.projectDirectory)
                rename { "google-services.json" }
            }
        }
    }

tasks.matching { it.name == "processDebugGoogleServices" }.configureEach {
    dependsOn(prepareDebugGoogleServices)
}

val prepareStoreQaGoogleServices =
    tasks.register("prepareStoreQaGoogleServices") {
        description = "Copies the sanitized example google-services config for store screenshot QA verification."
        val sourceFile = layout.projectDirectory.file("src/storeQa/google-services.example.json")
        val targetFile = layout.projectDirectory.file("src/storeQa/google-services.json")
        inputs.file(sourceFile)
        outputs.file(targetFile)
        onlyIf {
            !targetFile.asFile.exists() && sourceFile.asFile.exists()
        }
        doLast {
            copy {
                from(sourceFile)
                into(layout.projectDirectory.dir("src/storeQa"))
                rename { "google-services.json" }
            }
        }
    }

tasks.matching { it.name == "processStoreQaGoogleServices" }.configureEach {
    dependsOn(prepareStoreQaGoogleServices)
}

detekt {
    buildUponDefaultConfig = true
    baseline = file("$projectDir/detekt-baseline.xml")
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    // ── Core ──────────────────────────────────────────────────────────────────
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)

    // ── Compose ───────────────────────────────────────────────────────────────
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.window.size)
    implementation(libs.androidx.compose.material3.adaptive.navigation.suite)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.navigation.compose)

    // ── Glance (Widget) ───────────────────────────────────────────────────────
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)

    // ── Hilt ──────────────────────────────────────────────────────────────────
    implementation(libs.hilt.android)
    implementation(libs.guava)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    // ── Room ──────────────────────────────────────────────────────────────────
    implementation(libs.androidx.room.runtime)
    ksp(libs.androidx.room.compiler)

    // ── DataStore ─────────────────────────────────────────────────────────────
    implementation(libs.androidx.datastore.preferences)

    // ── Firebase ──────────────────────────────────────────────────────────────
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.analytics)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.config)
    implementation(libs.firebase.appcheck.playintegrity)
    debugImplementation(libs.firebase.appcheck.debug)
    add("storeQaImplementation", libs.firebase.appcheck.debug)

    // ── Google Play Services ──────────────────────────────────────────────────
    implementation(libs.play.services.ads)
    implementation(libs.play.services.appset)
    implementation(libs.user.messaging.platform)
    implementation(libs.play.billing.ktx)

    // ── WorkManager ───────────────────────────────────────────────────────────
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)

    // ── Network ───────────────────────────────────────────────────────────────
    implementation(libs.okhttp)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlin.serialization)

    // ── Serialization ─────────────────────────────────────────────────────────
    implementation(libs.kotlinx.serialization.json)

    // ── Image Loading ─────────────────────────────────────────────────────────
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    // ── Coroutines ────────────────────────────────────────────────────────────
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)

    // ── Animation ─────────────────────────────────────────────────────────────
    implementation(libs.lottie.compose)

    // ── Logging ───────────────────────────────────────────────────────────────
    implementation(libs.timber)

    // ── Unit Testing ──────────────────────────────────────────────────────────
    testImplementation(libs.junit)
    testImplementation(libs.mockk)
    testImplementation(libs.turbine)
    testImplementation(libs.truth)
    testImplementation(libs.robolectric)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.room.testing)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)

    // ── Screenshot Testing ────────────────────────────────────────────────────
    if (screenshotTestsEnabled) {
        add("screenshotTestImplementation", platform(libs.androidx.compose.bom))
        add("screenshotTestImplementation", libs.screenshot.validation.api)
        add("screenshotTestImplementation", libs.androidx.compose.ui.tooling)
    }

    // ── Instrumented Testing ──────────────────────────────────────────────────
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.rules)
    androidTestImplementation(libs.androidx.runner)

    // ── Debug ─────────────────────────────────────────────────────────────────
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
