import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const viewModel = fs.readFileSync('Astroloji/app/src/main/java/com/parsfilo/astrology/feature/premium/PremiumViewModel.kt', 'utf8');
const billing = fs.readFileSync('Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/repository/BillingManager.kt', 'utf8');

function methodBody(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing boundary ${end}`);
  return source.slice(from, to);
}

test('premium catalogue uses store QA seam only for store QA builds', () => {
  assert.match(viewModel, /resolvePremiumCatalogue\(\s*storeScreenshotQa\s*=\s*BuildConfig\.STORE_SCREENSHOT_QA/);
});

test('purchase and restore fail closed before BillingClient interaction', () => {
  const credits = methodBody(billing, 'fun launchCreditPurchase(', 'fun launchPurchase(');
  const purchase = methodBody(billing, 'fun launchPurchase(', 'private suspend fun startCreditCheckout(');
  const creditStarter = methodBody(billing, 'private suspend fun startCreditCheckout(', 'private suspend fun startPremiumCheckout(');
  const premiumStarter = methodBody(billing, 'private suspend fun startPremiumCheckout(', 'suspend fun restorePurchases()');
  const restore = methodBody(billing, 'suspend fun restorePurchases()', 'override fun onPurchasesUpdated(');
  const readiness = methodBody(
    billing,
    'private suspend fun BillingClient.ensureBillingReady()',
    'private suspend fun queryPremiumProductDetails(',
  );
  assert.match(readiness, /if \(isReady\) return successfulConnectionResult\(\)/);
  assert.match(readiness, /startConnection\(/);

  const launcher = methodBody(
    billing,
    'private suspend fun launchBillingFlowOnMain(',
    'private fun handleImmediateBillingLaunchResult(',
  );

  // Entrypoints must fail closed in screenshot QA builds before they can
  // acquire admission or call the SDK-facing starters. No direct SDK call
  // is allowed on either public purchase path.
  for (const [entrypoint, starterName] of [
    [credits, 'startCreditCheckout('],
    [purchase, 'startPremiumCheckout(']
  ]) {
    assert.match(entrypoint, /if \(BuildConfig\.STORE_SCREENSHOT_QA\)[\s\S]*?return/);
    assert.ok(entrypoint.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < entrypoint.indexOf('checkoutGate.tryStart('));
    assert.ok(entrypoint.indexOf('checkoutGate.tryStart(') < entrypoint.indexOf(starterName));
    assert.ok(!entrypoint.includes('ensureReady('));
    assert.ok(!entrypoint.includes('ensureBillingReady('));
    assert.ok(!entrypoint.includes('launchBillingFlowOnMain('));
    assert.ok(!entrypoint.includes('billingClient.launchBillingFlow'));
  }
  for (const starter of [creditStarter, premiumStarter]) {
    assert.match(starter, /billingClient\.ensureBillingReady\(\)/);
    assert.match(starter, /launchBillingFlowOnMain\(/);
    assert.ok(!starter.includes('billingClient.launchBillingFlow'));
  }

  // The actual SDK call remains in this private main-thread helper.
  // Two guarded callers and this declaration are the only references.
  assert.equal((billing.match(/launchBillingFlowOnMain\(/g) ?? []).length, 3);
  assert.match(launcher, /withContext\(Dispatchers\.Main\.immediate\)/);
  assert.match(launcher, /billingClient\.launchBillingFlow\(/);

  assert.match(restore, /if \(BuildConfig\.STORE_SCREENSHOT_QA\)[\s\S]*?return/);
  assert.ok(restore.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < restore.indexOf('billingClient.ensureBillingReady()'));
  assert.ok(restore.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < restore.indexOf('billingClient.queryPurchasesAsync'));
});
