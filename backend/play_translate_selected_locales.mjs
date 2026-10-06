// RETIRED: backend/play_translate_selected_locales.mjs
//
// This one-shot helper is retired and must stay inert.
// It previously translated Play listings via an unauthenticated third-party
// endpoint and committed them without the canonical backup/drift/readback
// pipeline (Astroloji/play + scripts/validate-play-metadata.mjs,
// scripts/reconcile-play-metadata.mjs). Use that canonical pipeline instead.
//
// The file is kept as a fail-closed stub so existing references fail loudly
// instead of silently invoking the old bypass. New code must not import it.
console.error(
  'RETIRED: backend/play_translate_selected_locales.mjs is retired. ' +
    'Use the canonical Astroloji/play + backup/drift/readback pipeline instead.',
);
process.exit(1);
