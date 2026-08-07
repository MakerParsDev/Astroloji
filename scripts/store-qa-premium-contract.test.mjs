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
  const purchase = methodBody(billing, 'fun launchPurchase(', 'suspend fun restorePurchases()');
  const restore = methodBody(billing, 'suspend fun restorePurchases()', 'override fun onPurchasesUpdated(');

  assert.match(purchase, /if \(BuildConfig\.STORE_SCREENSHOT_QA\)[\s\S]*?return/);
  assert.ok(purchase.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < purchase.indexOf('ensureReady()'));
  assert.ok(purchase.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < purchase.indexOf('billingClient.launchBillingFlow'));

  assert.match(restore, /if \(BuildConfig\.STORE_SCREENSHOT_QA\)[\s\S]*?return/);
  assert.ok(restore.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < restore.indexOf('ensureReady()'));
  assert.ok(restore.indexOf('BuildConfig.STORE_SCREENSHOT_QA') < restore.indexOf('billingClient.queryPurchasesAsync'));
});
