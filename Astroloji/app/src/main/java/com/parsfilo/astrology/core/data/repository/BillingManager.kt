package com.parsfilo.astrology.core.data.repository

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryProductDetailsResult
import com.android.billingclient.api.QueryPurchasesParams
import com.parsfilo.astrology.BuildConfig
import com.parsfilo.astrology.R
import com.parsfilo.astrology.core.data.remote.VerifySubscriptionRequest
import com.parsfilo.astrology.core.domain.model.SubscriptionStatus
import com.parsfilo.astrology.core.util.AppException
import com.parsfilo.astrology.core.util.AppResult
import com.parsfilo.astrology.core.util.BillingFailureReason
import com.parsfilo.astrology.core.util.StringsProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

private const val PRODUCT_PREMIUM_MONTHLY = "premium_monthly"
private const val PRODUCT_PREMIUM_WEEKLY = "premium_weekly"
private const val PRODUCT_PREMIUM_YEARLY = "premium_yearly"
private val PREMIUM_PRODUCT_IDS = setOf(PRODUCT_PREMIUM_MONTHLY, PRODUCT_PREMIUM_WEEKLY, PRODUCT_PREMIUM_YEARLY)

/**
 * Which plan the paywall recommends and pre-selects, driven by the `paywall_variant` Remote
 * Config key so pricing psychology can be A/B tested without a redeploy. [YEARLY_FIRST] is the
 * long-standing default (highest LTV lever per the product plan); [MONTHLY_FIRST] is the
 * alternative arm under test.
 */
enum class PaywallVariant(
    val remoteConfigValue: String,
) {
    YEARLY_FIRST("default"),
    MONTHLY_FIRST("monthly_first"),
    ;

    companion object {
        fun fromRemoteConfigValue(value: String): PaywallVariant =
            entries
                .firstOrNull { it.remoteConfigValue == value }
                ?: YEARLY_FIRST
    }
}

internal fun recommendedPremiumProductId(variant: PaywallVariant): String =
    when (variant) {
        PaywallVariant.YEARLY_FIRST -> PRODUCT_PREMIUM_YEARLY
        PaywallVariant.MONTHLY_FIRST -> PRODUCT_PREMIUM_MONTHLY
    }

private const val PRODUCT_CREDITS_SMALL = "credits_small"
private const val PRODUCT_CREDITS_MEDIUM = "credits_medium"
private const val PRODUCT_CREDITS_LARGE = "credits_large"
private val CREDIT_PRODUCT_IDS = setOf(PRODUCT_CREDITS_SMALL, PRODUCT_CREDITS_MEDIUM, PRODUCT_CREDITS_LARGE)

private const val CREDITS_SMALL_AMOUNT = 20
private const val CREDITS_MEDIUM_AMOUNT = 60
private const val CREDITS_LARGE_AMOUNT = 150

/** Credits granted per pack. Must stay in sync with backend's `CREDIT_PRODUCTS` (backend/src/types.ts). */
private val CREDIT_PRODUCT_AMOUNTS =
    mapOf(
        PRODUCT_CREDITS_SMALL to CREDITS_SMALL_AMOUNT,
        PRODUCT_CREDITS_MEDIUM to CREDITS_MEDIUM_AMOUNT,
        PRODUCT_CREDITS_LARGE to CREDITS_LARGE_AMOUNT,
    )

internal enum class PendingBillingFlow { NONE, PREMIUM, CREDITS }

data class PremiumPlanUi(
    val planId: String,
    val productId: String,
    val basePlanId: String? = null,
    val offerId: String? = null,
    val offerToken: String? = null,
    val title: String,
    val price: String,
    val priceAmountMicros: Long? = null,
    val hasFreeTrial: Boolean = false,
    val trialDays: Int? = null,
    val offerDescription: String? = null,
    val billingPeriod: String? = null,
    val displayPriority: Int = Int.MAX_VALUE,
    val introductoryPrice: String? = null,
    val introductoryCycles: Int = 0,
)

data class CreditPackUi(
    val productId: String,
    val title: String,
    val price: String,
    val credits: Int,
    val displayPriority: Int = Int.MAX_VALUE,
)

data class CreditPurchaseResult(
    val creditsGranted: Int,
    val balance: Int,
)

internal data class PricingPhaseSummary(
    val priceAmountMicros: Long,
    val formattedPrice: String,
    val billingPeriod: String?,
    val recurrenceMode: Int =
        if (priceAmountMicros == 0L) {
            ProductDetails.RecurrenceMode.NON_RECURRING
        } else {
            ProductDetails.RecurrenceMode.INFINITE_RECURRING
        },
    val billingCycleCount: Int = 0,
)

internal data class DisplayPricingSummary(
    val priceAmountMicros: Long?,
    val formattedPrice: String,
    val billingPeriod: String?,
)

data class BillingCatalogueDiagnostic(
    val productId: String,
    val statusCode: Int,
)

sealed interface BillingCatalogueLoadResult {
    data class Success(
        val plans: List<PremiumPlanUi>,
        val diagnostics: List<BillingCatalogueDiagnostic>,
    ) : BillingCatalogueLoadResult

    data class Failure(
        val message: String,
        val diagnostics: List<BillingCatalogueDiagnostic>,
    ) : BillingCatalogueLoadResult
}

sealed interface CreditCatalogueLoadResult {
    data class Success(
        val packs: List<CreditPackUi>,
    ) : CreditCatalogueLoadResult

    data class Failure(
        val message: String,
    ) : CreditCatalogueLoadResult
}

@Singleton
@Suppress("TooManyFunctions")
class BillingManager
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val sessionRepository: SessionRepository,
        private val creditsRepository: CreditsRepository,
        private val stringsProvider: StringsProvider,
    ) : com.android.billingclient.api.PurchasesUpdatedListener,
        java.io.Closeable {
        private val job = SupervisorJob()
        private val scope = CoroutineScope(job + Dispatchers.IO)
        private val _plans = MutableStateFlow<List<PremiumPlanUi>>(emptyList())
        val plans: StateFlow<List<PremiumPlanUi>> = _plans.asStateFlow()

        private val _purchaseState = MutableStateFlow<AppResult<SubscriptionStatus>?>(null)
        val purchaseState: StateFlow<AppResult<SubscriptionStatus>?> = _purchaseState.asStateFlow()
        private val catalog = mutableMapOf<String, ProductDetails>()

        private val _creditPacks = MutableStateFlow<List<CreditPackUi>>(emptyList())
        val creditPacks: StateFlow<List<CreditPackUi>> = _creditPacks.asStateFlow()

        private val _creditPurchaseState = MutableStateFlow<AppResult<CreditPurchaseResult>?>(null)
        val creditPurchaseState: StateFlow<AppResult<CreditPurchaseResult>?> = _creditPurchaseState.asStateFlow()
        private val creditCatalog = mutableMapOf<String, ProductDetails>()

        @Volatile
        private var pendingFlow: PendingBillingFlow = PendingBillingFlow.NONE

        private val billingClient: BillingClient =
            BillingClient
                .newBuilder(context)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build()

        suspend fun loadPlans(): BillingCatalogueLoadResult {
            val catalogueUnavailableMessage = stringsProvider.get(R.string.billing_catalogue_unavailable)
            val readyResult = ensureReady()
            if (!isSuccessfulBillingSetup(readyResult.responseCode)) {
                catalog.clear()
                _plans.value = emptyList()
                return BillingCatalogueLoadResult.Failure(
                    message = readyResult.debugMessage.ifBlank { catalogueUnavailableMessage },
                    diagnostics = emptyList(),
                )
            }

            val (billingResult, productDetailsResult) = queryPremiumProductDetails(billingClient)
            val diagnostics = productDetailsResult.toCatalogueDiagnostics()
            logCatalogueDiagnostics(diagnostics)
            val plans =
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    storeCatalogue(productDetailsResult.productDetailsList)
                } else {
                    catalog.clear()
                    _plans.value = emptyList()
                    emptyList()
                }

            val queryMessage =
                billingResult.debugMessage.takeUnless {
                    billingResult.responseCode == BillingResponseCode.OK
                }
            return resolveCatalogueLoadResult(
                plans = plans,
                diagnostics = diagnostics,
                queryMessage = queryMessage,
                catalogueUnavailableMessage = catalogueUnavailableMessage,
            )
        }

        private fun storeCatalogue(productDetails: List<ProductDetails>): List<PremiumPlanUi> {
            catalog.clear()
            productDetails.forEach { detail -> catalog[detail.productId] = detail }
            return buildPremiumPlans(productDetails).also { _plans.value = it }
        }

        suspend fun loadCreditPacks(): CreditCatalogueLoadResult {
            val catalogueUnavailableMessage = stringsProvider.get(R.string.billing_credit_catalogue_unavailable)
            val readyResult = ensureReady()
            if (!isSuccessfulBillingSetup(readyResult.responseCode)) {
                creditCatalog.clear()
                _creditPacks.value = emptyList()
                return CreditCatalogueLoadResult.Failure(
                    readyResult.debugMessage.ifBlank { catalogueUnavailableMessage },
                )
            }

            val (billingResult, productDetailsResult) = queryCreditProductDetails(billingClient)
            logCatalogueDiagnostics(productDetailsResult.toCatalogueDiagnostics())
            val packs =
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    storeCreditCatalogue(productDetailsResult.productDetailsList)
                } else {
                    creditCatalog.clear()
                    _creditPacks.value = emptyList()
                    emptyList()
                }

            val queryMessage =
                billingResult.debugMessage
                    .takeUnless { billingResult.responseCode == BillingResponseCode.OK }
                    ?.ifBlank { catalogueUnavailableMessage }
            return if (packs.isNotEmpty()) {
                CreditCatalogueLoadResult.Success(packs)
            } else {
                CreditCatalogueLoadResult.Failure(queryMessage ?: catalogueUnavailableMessage)
            }
        }

        private fun storeCreditCatalogue(productDetails: List<ProductDetails>): List<CreditPackUi> {
            creditCatalog.clear()
            productDetails.forEach { detail -> creditCatalog[detail.productId] = detail }
            return buildCreditPacks(productDetails).also { _creditPacks.value = it }
        }

        fun clearPurchaseState() {
            _purchaseState.value = null
        }

        fun clearCreditPurchaseState() {
            _creditPurchaseState.value = null
        }

        fun launchCreditPurchase(
            activity: Activity,
            productId: String,
        ) {
            if (BuildConfig.STORE_SCREENSHOT_QA) {
                _creditPurchaseState.value =
                    AppResult.Error(
                        AppException.BillingException(stringsProvider.get(R.string.billing_purchase_failed)),
                    )
                return
            }
            scope.launch {
                _creditPurchaseState.value = AppResult.Loading
                val readyResult = ensureReady()
                if (!isSuccessfulBillingSetup(readyResult.responseCode)) {
                    _creditPurchaseState.value =
                        AppResult.Error(
                            AppException.BillingException(
                                readyResult.debugMessage.ifBlank {
                                    stringsProvider.get(R.string.billing_purchase_failed)
                                },
                            ),
                        )
                    return@launch
                }
                val detail =
                    fetchProductDetails(productId, creditCatalog, ProductType.INAPP) ?: run {
                        _creditPurchaseState.value =
                            AppResult.Error(
                                AppException.BillingException(
                                    stringsProvider.get(R.string.billing_credit_pack_not_found),
                                ),
                            )
                        return@launch
                    }
                val params =
                    BillingFlowParams.ProductDetailsParams
                        .newBuilder()
                        .setProductDetails(detail)
                        .build()
                pendingFlow = PendingBillingFlow.CREDITS
                val launchResult = launchBillingFlowOnMain(activity, params)
                handleImmediateBillingLaunchResult(PendingBillingFlow.CREDITS, launchResult)
            }
        }

        fun launchPurchase(
            activity: Activity,
            planId: String,
        ) {
            if (BuildConfig.STORE_SCREENSHOT_QA) {
                _purchaseState.value =
                    AppResult.Error(
                        AppException.BillingException(stringsProvider.get(R.string.billing_purchase_failed)),
                    )
                return
            }
            scope.launch {
                _purchaseState.value = AppResult.Loading
                val readyResult = ensureReady()
                if (!isSuccessfulBillingSetup(readyResult.responseCode)) {
                    _purchaseState.value =
                        AppResult.Error(
                            AppException.BillingException(
                                readyResult.debugMessage.ifBlank {
                                    stringsProvider.get(R.string.billing_purchase_failed)
                                },
                            ),
                        )
                    return@launch
                }
                val plan =
                    _plans.value.firstOrNull { it.planId == planId } ?: run {
                        _purchaseState.value =
                            AppResult.Error(AppException.BillingException(stringsProvider.get(R.string.billing_plan_not_found)))
                        return@launch
                    }
                val detail =
                    fetchProductDetails(plan.productId, catalog, ProductType.SUBS) ?: run {
                        _purchaseState.value =
                            AppResult.Error(AppException.BillingException(stringsProvider.get(R.string.billing_plan_not_found)))
                        return@launch
                    }
                val offerToken =
                    plan.offerToken?.takeIf { it.isNotBlank() } ?: run {
                        _purchaseState.value =
                            AppResult.Error(AppException.BillingException(stringsProvider.get(R.string.billing_plan_not_found)))
                        return@launch
                    }
                val params =
                    BillingFlowParams.ProductDetailsParams
                        .newBuilder()
                        .setProductDetails(detail)
                        .setOfferToken(offerToken)
                        .build()
                pendingFlow = PendingBillingFlow.PREMIUM
                val launchResult = launchBillingFlowOnMain(activity, params)
                handleImmediateBillingLaunchResult(PendingBillingFlow.PREMIUM, launchResult)
            }
        }

        suspend fun restorePurchases(): AppResult<SubscriptionStatus> {
            if (BuildConfig.STORE_SCREENSHOT_QA) {
                return AppResult
                    .Error(
                        AppException.BillingException(stringsProvider.get(R.string.billing_restore_failed)),
                    ).also { _purchaseState.value = it }
            }
            _purchaseState.value = AppResult.Loading
            val readyResult = ensureReady()
            if (!isSuccessfulBillingSetup(readyResult.responseCode)) {
                return AppResult
                    .Error(
                        AppException.BillingException(
                            readyResult.debugMessage.ifBlank { stringsProvider.get(R.string.billing_restore_failed) },
                        ),
                    ).also { _purchaseState.value = it }
            }
            val purchases =
                suspendCancellableCoroutine<Pair<BillingResult, List<Purchase>>> { continuation ->
                    billingClient.queryPurchasesAsync(
                        QueryPurchasesParams.newBuilder().setProductType(ProductType.SUBS).build(),
                    ) { result, list ->
                        continuation.resume(result to list)
                    }
                }
            if (purchases.first.responseCode != BillingResponseCode.OK) {
                return AppResult
                    .Error(AppException.BillingException(stringsProvider.get(R.string.billing_restore_failed)))
                    .also { _purchaseState.value = it }
            }
            val purchase =
                selectPurchaseForVerification(purchases.second)
                    ?: return AppResult
                        .Error(
                            AppException.BillingException(
                                stringsProvider.get(
                                    if (hasPendingPremiumPurchase(purchases.second)) {
                                        R.string.billing_payment_pending
                                    } else {
                                        R.string.billing_restore_missing_purchase
                                    },
                                ),
                            ),
                        ).also { _purchaseState.value = it }
            return verifyPurchase(purchase, restore = true)
                .also { _purchaseState.value = it }
        }

        override fun onPurchasesUpdated(
            billingResult: BillingResult,
            purchases: MutableList<Purchase>?,
        ) {
            val initialFlow = pendingFlow
            pendingFlow = PendingBillingFlow.NONE
            val flow =
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    resolveSuccessfulPurchaseFlow(initialFlow, purchases.orEmpty().map { it.products })
                } else {
                    initialFlow
                }
            when (billingResult.responseCode) {
                BillingResponseCode.OK -> {
                    when (flow) {
                        PendingBillingFlow.CREDITS -> {
                            val purchase = selectCreditPurchaseForVerification(purchases.orEmpty())
                            if (purchase == null) {
                                applyPurchaseFlowResult(flow, missingPurchaseError(flow, purchases.orEmpty()))
                            } else {
                                scope.launch { _creditPurchaseState.value = verifyCreditPurchase(purchase) }
                            }
                        }
                        PendingBillingFlow.PREMIUM -> {
                            val purchase = selectPurchaseForVerification(purchases.orEmpty())
                            if (purchase == null) {
                                applyPurchaseFlowResult(flow, missingPurchaseError(flow, purchases.orEmpty()))
                            } else {
                                scope.launch { _purchaseState.value = verifyPurchase(purchase, restore = false) }
                            }
                        }
                        PendingBillingFlow.NONE ->
                            Timber.w("Ignoring unrecognized Billing purchase callback without an active flow")
                    }
                }
                BillingResponseCode.USER_CANCELED -> {
                    applyPurchaseFlowResult(
                        flow,
                        AppResult.Error(
                            AppException.BillingException(
                                message = stringsProvider.get(R.string.billing_purchase_cancelled),
                                reason = BillingFailureReason.USER_CANCELLED,
                            ),
                        ),
                    )
                }
                else -> {
                    applyPurchaseFlowResult(
                        flow,
                        AppResult.Error(
                            AppException.BillingException(
                                billingResult.debugMessage.ifBlank { stringsProvider.get(R.string.billing_purchase_failed) },
                            ),
                        ),
                    )
                }
            }
        }

        private suspend fun launchBillingFlowOnMain(
            activity: Activity,
            product: BillingFlowParams.ProductDetailsParams,
        ): BillingResult =
            withContext(Dispatchers.Main.immediate) {
                billingClient.launchBillingFlow(
                    activity,
                    BillingFlowParams
                        .newBuilder()
                        .setProductDetailsParamsList(listOf(product))
                        .build(),
                )
            }

        private fun handleImmediateBillingLaunchResult(
            flow: PendingBillingFlow,
            launchResult: BillingResult,
        ) {
            if (launchResult.responseCode == BillingResponseCode.OK) return
            if (pendingFlow == flow) pendingFlow = PendingBillingFlow.NONE
            applyPurchaseFlowResult(
                flow,
                AppResult.Error(
                    AppException.BillingException(
                        launchResult.debugMessage.ifBlank {
                            stringsProvider.get(R.string.billing_purchase_failed)
                        },
                    ),
                ),
            )
        }

        private fun applyPurchaseFlowResult(
            flow: PendingBillingFlow,
            result: AppResult<Nothing>,
        ) {
            when (flow) {
                PendingBillingFlow.CREDITS -> _creditPurchaseState.value = result
                PendingBillingFlow.PREMIUM -> _purchaseState.value = result
                PendingBillingFlow.NONE -> Timber.w("Ignoring Billing result without an active purchase flow")
            }
        }

        private fun missingPurchaseError(
            flow: PendingBillingFlow,
            purchases: List<Purchase>,
        ): AppResult.Error {
            val hasPending =
                purchases.any { purchase ->
                    purchase.purchaseState == Purchase.PurchaseState.PENDING &&
                        when (flow) {
                            PendingBillingFlow.CREDITS -> resolveRecognizedCreditProductId(purchase.products) != null
                            PendingBillingFlow.PREMIUM -> resolveRecognizedProductId(purchase.products) != null
                            PendingBillingFlow.NONE -> false
                        }
                }
            return AppResult.Error(
                AppException.BillingException(
                    stringsProvider.get(
                        if (hasPending) R.string.billing_payment_pending else R.string.billing_purchase_failed,
                    ),
                ),
            )
        }

        private suspend fun verifyCreditPurchase(purchase: Purchase): AppResult<CreditPurchaseResult> {
            val productId = resolveRecognizedCreditProductId(purchase.products)
            val validationError =
                when {
                    purchase.purchaseState != Purchase.PurchaseState.PURCHASED ->
                        AppException.BillingException(stringsProvider.get(R.string.billing_payment_pending))
                    productId == null ->
                        AppException.BillingException(stringsProvider.get(R.string.billing_credit_pack_not_found))
                    else -> null
                }
            if (validationError != null) {
                return AppResult.Error(validationError)
            }

            val result = creditsRepository.verifyPurchase(purchase.purchaseToken, checkNotNull(productId))
            return when (result) {
                is AppResult.Success ->
                    AppResult.Success(
                        CreditPurchaseResult(
                            creditsGranted = result.data.creditsGranted,
                            balance = result.data.balance,
                        ),
                    )
                is AppResult.Error -> AppResult.Error(result.exception)
                AppResult.Loading -> AppResult.Loading
            }
        }

        private suspend fun verifyPurchase(
            purchase: Purchase,
            restore: Boolean,
        ): AppResult<SubscriptionStatus> {
            if (purchase.purchaseState != Purchase.PurchaseState.PURCHASED) {
                return AppResult.Error(AppException.BillingException(stringsProvider.get(R.string.billing_payment_pending)))
            }
            val productId =
                resolveRecognizedProductId(purchase.products)
                    ?: return AppResult.Error(
                        AppException.BillingException(stringsProvider.get(R.string.billing_plan_not_found)),
                    )
            val response =
                if (restore) {
                    sessionRepository.apiRestore(
                        VerifySubscriptionRequest(
                            purchaseToken = purchase.purchaseToken,
                            productId = productId,
                        ),
                    )
                } else {
                    sessionRepository.apiVerify(
                        VerifySubscriptionRequest(
                            purchaseToken = purchase.purchaseToken,
                            productId = productId,
                        ),
                    )
                }
            if (response !is AppResult.Success) return response
            if (!purchase.isAcknowledged) {
                val ackResult =
                    suspendCancellableCoroutine { continuation ->
                        billingClient.acknowledgePurchase(
                            AcknowledgePurchaseParams
                                .newBuilder()
                                .setPurchaseToken(purchase.purchaseToken)
                                .build(),
                        ) { continuation.resume(it) }
                    }
                if (ackResult.responseCode != BillingResponseCode.OK) {
                    return AppResult.Error(AppException.BillingException(stringsProvider.get(R.string.billing_acknowledge_failed)))
                }
            }
            return response
        }

        private suspend fun fetchProductDetails(
            productId: String,
            catalogCache: MutableMap<String, ProductDetails>,
            productType: String,
        ): ProductDetails? {
            val cachedDetail = catalogCache[productId]
            val readyResult = ensureReady()
            val queriedDetail =
                if (!isSuccessfulBillingSetup(readyResult.responseCode)) {
                    null
                } else {
                    val params =
                        QueryProductDetailsParams
                            .newBuilder()
                            .setProductList(
                                listOf(
                                    QueryProductDetailsParams.Product
                                        .newBuilder()
                                        .setProductId(productId)
                                        .setProductType(productType)
                                        .build(),
                                ),
                            ).build()
                    val result =
                        suspendCancellableCoroutine<Pair<BillingResult, QueryProductDetailsResult>> { continuation ->
                            billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsResult ->
                                continuation.resume(billingResult to productDetailsResult)
                            }
                        }
                    if (result.first.responseCode == BillingResponseCode.OK) {
                        result.second.productDetailsList.firstOrNull()?.also { detail ->
                            catalogCache[detail.productId] = detail
                        }
                    } else {
                        null
                    }
                }
            return cachedDetail ?: queriedDetail
        }

        private suspend fun ensureReady(): BillingResult {
            if (billingClient.isReady) {
                return successfulConnectionResult()
            }
            return suspendCancellableCoroutine { continuation ->
                billingClient.startConnection(
                    object : BillingClientStateListener {
                        override fun onBillingSetupFinished(billingResult: BillingResult) {
                            if (continuation.isActive) continuation.resume(billingResult)
                        }

                        override fun onBillingServiceDisconnected() {
                            if (continuation.isActive) continuation.resume(disconnectedConnectionResult())
                        }
                    },
                )
            }
        }

        override fun close() {
            job.cancel()
            billingClient.endConnection()
        }
    }

private suspend fun queryPremiumProductDetails(
    billingClient: BillingClient,
): Pair<BillingResult, QueryProductDetailsResult> {
    val params =
        QueryProductDetailsParams
            .newBuilder()
            .setProductList(
                listOf(PRODUCT_PREMIUM_YEARLY, PRODUCT_PREMIUM_MONTHLY, PRODUCT_PREMIUM_WEEKLY).map { productId ->
                    QueryProductDetailsParams.Product
                        .newBuilder()
                        .setProductId(productId)
                        .setProductType(ProductType.SUBS)
                        .build()
                },
            ).build()
    return suspendCancellableCoroutine { continuation ->
        billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsResult ->
            continuation.resume(billingResult to productDetailsResult)
        }
    }
}

private suspend fun queryCreditProductDetails(
    billingClient: BillingClient,
): Pair<BillingResult, QueryProductDetailsResult> {
    val params =
        QueryProductDetailsParams
            .newBuilder()
            .setProductList(
                CREDIT_PRODUCT_IDS.map { productId ->
                    QueryProductDetailsParams.Product
                        .newBuilder()
                        .setProductId(productId)
                        .setProductType(ProductType.INAPP)
                        .build()
                },
            ).build()
    return suspendCancellableCoroutine { continuation ->
        billingClient.queryProductDetailsAsync(params) { billingResult, productDetailsResult ->
            continuation.resume(billingResult to productDetailsResult)
        }
    }
}

private fun QueryProductDetailsResult.toCatalogueDiagnostics(): List<BillingCatalogueDiagnostic> =
    unfetchedProductList.map { unfetched ->
        BillingCatalogueDiagnostic(
            productId = unfetched.productId,
            statusCode = unfetched.statusCode,
        )
    }

private fun logCatalogueDiagnostics(diagnostics: List<BillingCatalogueDiagnostic>) {
    diagnostics.forEach { diagnostic ->
        Timber.w(
            "Billing catalogue product unavailable: productId=%s statusCode=%d",
            diagnostic.productId,
            diagnostic.statusCode,
        )
    }
}

internal fun buildPlanId(
    productId: String,
    basePlanId: String?,
    offerId: String?,
): String = listOf(productId, basePlanId ?: "base", offerId ?: "default").joinToString(":")

internal fun resolveRecognizedProductId(products: List<String>): String? {
    val recognizedProducts = products.filter { it in PREMIUM_PRODUCT_IDS }.distinct().sorted()
    return if (recognizedProducts.size == 1) recognizedProducts.single() else null
}

internal fun resolveRecognizedCreditProductId(products: List<String>): String? {
    val recognizedProducts = products.filter { it in CREDIT_PRODUCT_IDS }.distinct().sorted()
    return if (recognizedProducts.size == 1) recognizedProducts.single() else null
}

/**
 * Route only to the category the user started. In the absence of an active flow, accept an
 * unambiguous recognized product family; never let an unknown/credit callback modify Premium.
 */
internal fun resolveSuccessfulPurchaseFlow(
    activeFlow: PendingBillingFlow,
    productLists: List<List<String>>,
): PendingBillingFlow {
    if (activeFlow != PendingBillingFlow.NONE) return activeFlow
    val hasPremium = productLists.any { resolveRecognizedProductId(it) != null }
    val hasCredits = productLists.any { resolveRecognizedCreditProductId(it) != null }
    return when {
        hasPremium && !hasCredits -> PendingBillingFlow.PREMIUM
        hasCredits && !hasPremium -> PendingBillingFlow.CREDITS
        else -> PendingBillingFlow.NONE
    }
}

internal fun isSuccessfulBillingSetup(responseCode: Int): Boolean = responseCode == BillingResponseCode.OK

internal fun defaultPremiumPlan(
    plans: List<PremiumPlanUi>,
    variant: PaywallVariant = PaywallVariant.YEARLY_FIRST,
): PremiumPlanUi? =
    plans.firstOrNull { it.productId == recommendedPremiumProductId(variant) }
        ?: plans.minByOrNull { it.displayPriority }

internal fun resolveCatalogueLoadResult(
    plans: List<PremiumPlanUi>,
    diagnostics: List<BillingCatalogueDiagnostic>,
    queryMessage: String?,
    catalogueUnavailableMessage: String,
): BillingCatalogueLoadResult =
    if (plans.isNotEmpty()) {
        BillingCatalogueLoadResult.Success(plans = plans, diagnostics = diagnostics)
    } else {
        BillingCatalogueLoadResult.Failure(
            message = queryMessage?.takeIf { it.isNotBlank() } ?: catalogueUnavailableMessage,
            diagnostics = diagnostics,
        )
    }

internal fun hasPendingPremiumPurchase(purchases: List<Purchase>): Boolean =
    purchases.any {
        it.purchaseState == Purchase.PurchaseState.PENDING &&
            resolveRecognizedProductId(it.products) != null
    }

internal fun selectPurchaseForVerification(purchases: List<Purchase>): Purchase? =
    purchases
        .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
        .sortedBy { resolveRecognizedProductId(it.products) }
        .firstOrNull { resolveRecognizedProductId(it.products) != null }

private fun selectCreditPurchaseForVerification(purchases: List<Purchase>): Purchase? =
    purchases
        .filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }
        .sortedBy { resolveRecognizedCreditProductId(it.products) }
        .firstOrNull { resolveRecognizedCreditProductId(it.products) != null }

private fun buildCreditPacks(productDetailsList: List<ProductDetails>): List<CreditPackUi> =
    productDetailsList
        .mapNotNull { detail ->
            val credits = CREDIT_PRODUCT_AMOUNTS[detail.productId] ?: return@mapNotNull null
            CreditPackUi(
                productId = detail.productId,
                title = detail.name,
                price = detail.oneTimePurchaseOfferDetails?.formattedPrice.orEmpty(),
                credits = credits,
                displayPriority = defaultCreditDisplayPriority(detail.productId),
            )
        }.sortedBy { it.displayPriority }

internal fun defaultCreditDisplayPriority(productId: String): Int =
    when (productId) {
        PRODUCT_CREDITS_SMALL -> 0
        PRODUCT_CREDITS_MEDIUM -> 1
        PRODUCT_CREDITS_LARGE -> 2
        else -> Int.MAX_VALUE
    }

private fun buildPremiumPlans(productDetailsList: List<ProductDetails>): List<PremiumPlanUi> =
    productDetailsList
        .flatMap { detail ->
            val offers = detail.subscriptionOfferDetails.orEmpty()
            if (offers.isEmpty()) {
                listOf(
                    PremiumPlanUi(
                        planId = buildPlanId(detail.productId, null, null),
                        productId = detail.productId,
                        title = detail.name,
                        price = "",
                        offerDescription = detail.description,
                        displayPriority = defaultDisplayPriority(detail.productId),
                    ),
                )
            } else {
                val phaseLists =
                    offers.map { offer ->
                        offer.pricingPhases.pricingPhaseList.map { phase ->
                            PricingPhaseSummary(
                                priceAmountMicros = phase.priceAmountMicros,
                                formattedPrice = phase.formattedPrice,
                                billingPeriod = phase.billingPeriod,
                                recurrenceMode = phase.recurrenceMode,
                                billingCycleCount = phase.billingCycleCount,
                            )
                        }
                    }
                // Google Play may return several eligible offers for a product.
                // Prefer a describable trial, but never hide a usable paid base
                // plan behind an unsupported introductory schedule.
                val selectedOfferIndex = selectPreferredDisclosableOfferIndex(phaseLists).takeIf { it >= 0 } ?: 0
                val selectedOffer = offers[selectedOfferIndex]
                val phases = phaseLists[selectedOfferIndex]
                val displayPricing = resolveDisplayPricing(phases)
                // Invalid phase sequences must not leak a misleading trial
                // label into the paywall even though checkout is disabled.
                val displayedTrialDays = resolveDisclosableTrialDays(phases, displayPricing)
                val introductoryPhase = resolveIntroductoryPricing(phases)
                listOf(
                    PremiumPlanUi(
                        planId = buildPlanId(detail.productId, selectedOffer.basePlanId, selectedOffer.offerId),
                        productId = detail.productId,
                        basePlanId = selectedOffer.basePlanId,
                        offerId = selectedOffer.offerId,
                        offerToken = selectedOffer.offerToken,
                        title = detail.name,
                        price = displayPricing?.formattedPrice.orEmpty(),
                        priceAmountMicros = displayPricing?.priceAmountMicros,
                        hasFreeTrial = displayedTrialDays != null,
                        trialDays = displayedTrialDays,
                        offerDescription = detail.description,
                        billingPeriod = displayPricing?.billingPeriod,
                        displayPriority = defaultDisplayPriority(detail.productId),
                        introductoryPrice = introductoryPhase?.formattedPrice,
                        introductoryCycles = introductoryPhase?.let { introductoryCycleCount(it) } ?: 0,
                    ),
                )
            }
        }.sortedBy { it.displayPriority }

internal fun selectPreferredDisclosableOfferIndex(phaseLists: List<List<PricingPhaseSummary>>): Int {
    val eligibleIndices = phaseLists.indices.filter { resolveDisplayPricing(phaseLists[it]) != null }
    return eligibleIndices.firstOrNull { index ->
        phaseLists[index].any { it.priceAmountMicros == 0L }
    } ?: eligibleIndices.firstOrNull() ?: -1
}

/**
 * The amount shown as the renewal price must be the indefinitely recurring phase,
 * never a finite discounted introductory payment. Unsupported pricing schedules
 * fail closed until the paywall can disclose every charge accurately.
 */
internal fun resolveDisplayPricing(phases: List<PricingPhaseSummary>): DisplayPricingSummary? {
    val renewal = phases.lastOrNull()
    val prior = phases.dropLast(1)
    val paidIntro = prior.filter { it.priceAmountMicros > 0L }
    val validRenewal =
        renewal != null &&
            renewal.recurrenceMode == ProductDetails.RecurrenceMode.INFINITE_RECURRING &&
            renewal.priceAmountMicros > 0L &&
            renewal.formattedPrice.isNotBlank()
    val validIntro =
        paidIntro.size <= 1 &&
            prior.none { it.recurrenceMode == ProductDetails.RecurrenceMode.INFINITE_RECURRING } &&
            paidIntro.all {
                it.billingPeriod == renewal?.billingPeriod && introductoryCycleCount(it) > 0
            }
    return renewal?.takeIf { validRenewal && validIntro && isDisclosableFreeTrial(prior) }?.let {
        DisplayPricingSummary(
            priceAmountMicros = it.priceAmountMicros,
            formattedPrice = it.formattedPrice,
            billingPeriod = it.billingPeriod,
        )
    }
}

/** The paywall describes one initial, exact-length trial, never a chain or a delayed free phase. */
private fun isDisclosableFreeTrial(priorPhases: List<PricingPhaseSummary>): Boolean {
    val freePhases = priorPhases.filter { it.priceAmountMicros == 0L }
    val trial = freePhases.singleOrNull()
    return freePhases.isEmpty() ||
        (
            trial != null &&
                priorPhases.firstOrNull() == trial &&
                (billingPeriodDays(trial.billingPeriod) ?: 0) > 0 &&
                when (trial.recurrenceMode) {
                    ProductDetails.RecurrenceMode.NON_RECURRING -> true
                    ProductDetails.RecurrenceMode.FINITE_RECURRING -> trial.billingCycleCount == 1
                    else -> false
                }
        )
}

internal fun resolveIntroductoryPricing(phases: List<PricingPhaseSummary>): PricingPhaseSummary? =
    phases
        .dropLast(1)
        .singleOrNull { it.priceAmountMicros > 0L }
        ?.takeIf { resolveDisplayPricing(phases) != null }

private fun introductoryCycleCount(phase: PricingPhaseSummary): Int =
    when (phase.recurrenceMode) {
        ProductDetails.RecurrenceMode.FINITE_RECURRING -> phase.billingCycleCount
        ProductDetails.RecurrenceMode.NON_RECURRING -> 1
        else -> 0
    }

/**
 * Never display trial days from a schedule rejected by renewal/phase validation.
 * Invalid offers remain non-purchasable AND do not advertise an unsupported trial.
 */
internal fun resolveDisclosableTrialDays(
    phases: List<PricingPhaseSummary>,
    displayPricing: DisplayPricingSummary?,
): Int? = displayPricing?.let { extractTrialDays(phases) }

internal fun extractTrialDays(phases: List<PricingPhaseSummary>): Int? =
    phases
        .firstOrNull { it.priceAmountMicros == 0L }
        ?.billingPeriod
        ?.let(::billingPeriodDays)

private fun billingPeriodDays(value: String?): Int? {
    if (value.isNullOrBlank() || !value.startsWith("P")) {
        return null
    }
    val days =
        Regex("P(\\d+)D")
            .matchEntire(value)
            ?.groupValues
            ?.getOrNull(1)
            ?.toIntOrNull()
    if (days != null) return days
    val weeks =
        Regex("P(\\d+)W")
            .matchEntire(value)
            ?.groupValues
            ?.getOrNull(1)
            ?.toIntOrNull()
    return weeks?.times(7)
}

internal fun defaultDisplayPriority(productId: String): Int =
    when (productId) {
        PRODUCT_PREMIUM_YEARLY -> 0
        PRODUCT_PREMIUM_MONTHLY -> 1
        PRODUCT_PREMIUM_WEEKLY -> 2
        else -> Int.MAX_VALUE
    }

private fun successfulConnectionResult(): BillingResult =
    BillingResult
        .newBuilder()
        .setResponseCode(BillingResponseCode.OK)
        .setDebugMessage("Billing client is ready.")
        .build()

private fun disconnectedConnectionResult(): BillingResult =
    BillingResult
        .newBuilder()
        .setResponseCode(BillingResponseCode.SERVICE_DISCONNECTED)
        .setDebugMessage("Billing service disconnected before setup completed.")
        .build()
