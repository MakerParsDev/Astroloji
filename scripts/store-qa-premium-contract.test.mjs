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
  const purchase = methodBody(billing, 'fun launchPurchase(', 'suspend fun restorePurchases()');
  const restore = methodBody(billing, 'suspend fun restorePurchases()', 'override fun onPurchasesUpdated(');
  const launcher = methodBody(
    billing,
    'private suspend fun launchBillingFlowOnMain(',
    'private fun handleImmediateBillingLaunchResult(',
  );

  // Premium and credit entrypoints must reject screenshot-QA builds before
  // either BillingClient initialization or their shared SDK launcher.
  for (const entrypoint of [credits, purchase]) {
    assert.match(entrypoint, /if \(BuildConfig\.STORE_SCREENSHOT_QA\)[\s\S]*?return/);
    assert.ok(entrypoint.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < entrypoint.indexOf('ensureReady()'));
    assert.ok(entrypoint.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < entrypoint.indexOf('launchBillingFlowOnMain('));
    assert.ok(!entrypoint.includes('billingClient.launchBillingFlow'));
  }

  // The actual SDK call was moved to this private main-thread helper.
  // Two guarded callers and this declaration are the only references.
  assert.equal((billing.match(/launchBillingFlowOnMain\(/g) ?? []).length, 3);
  assert.match(launcher, /withContext\(Dispatchers\.Main\.immediate\)/);
  assert.match(launcher, /billingClient\.launchBillingFlow\(/);

  assert.match(restore, /if \(BuildConfig\.STORE_SCREENSHOT_QA\)[\s\S]*?return/);
  assert.ok(restore.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < restore.indexOf('ensureReady()'));
  assert.ok(restore.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < restore.indexOf('billingClient.queryPurchasesAsync'));
});
