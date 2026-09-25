import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMetadataReconciliation } from './reconcile-play-metadata.mjs';

function baseDiff() {
  return {
    blockingErrors: [],
    extraLiveLocales: [],
    missingLiveLocales: [],
    supportedLocales: ['en-US'],
    listings: { 'en-US': { title: 'UNCHANGED', shortDescription: 'UNCHANGED', fullDescription: 'UNCHANGED' } },
    images: { 'en-US': { icon: { status: 'UNCHANGED' }, featureGraphic: { status: 'UNCHANGED' }, phoneScreenshots: { status: 'UNCHANGED' } } },
  };
}

test('holds when live metadata already matches canonical state', () => {
  assert.equal(classifyMetadataReconciliation(baseDiff()).action, 'hold');
});

test('publishes changed supported listing or image metadata', () => {
  const listing = baseDiff(); listing.listings['en-US'].title = 'CHANGED';
  assert.equal(classifyMetadataReconciliation(listing).action, 'publish');
  const image = baseDiff(); image.images['en-US'].phoneScreenshots.status = 'CHANGED';
  assert.equal(classifyMetadataReconciliation(image).action, 'publish');
});

test('publishes when a supported locale is missing live', () => {
  const diff = baseDiff(); diff.missingLiveLocales = ['en-US'];
  assert.equal(classifyMetadataReconciliation(diff).action, 'publish');
});

test('fails closed on rollout/subscription blockers or unexpected locale deletion', () => {
  const blocked = baseDiff(); blocked.blockingErrors = ['Production rollout drift'];
  assert.equal(classifyMetadataReconciliation(blocked).action, 'hold');
  const cleanup = baseDiff(); cleanup.extraLiveLocales = ['it-IT'];
  assert.equal(classifyMetadataReconciliation(cleanup).action, 'hold');
});
