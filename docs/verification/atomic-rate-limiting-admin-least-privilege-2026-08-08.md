# Issue #7 Verification — Atomic Rate Limiting and Scoped Admin Access

Date: 2026-08-08
Issue: #7

This record contains only sanitized verification evidence. It intentionally omits credential material, production policy values, customer identifiers, privileged response bodies, and infrastructure-internal identifiers.

## Reviewed change chain

- Phase 0: PR #69, reviewed head `0f9e7b0ad119e81031e17bd04ad5a55e1234cacf`, merge `4b538d620f933195fa0b2971aefb8d95c283fb47`.
- Phase A: PR #70, reviewed head `65623ccecd0d0ecddde34a292c9c9f69da1207cf`, merge `d963603d35e120dc77c62ab58ec9aef7517c48ff`.
- Phase B: PR #71, reviewed head `28099126d4478bbd6f4abf96f7aab45832406dff`, merge `a550ab74559cdaa8d3b993606d5c7dc5c1b02ef1`.
- Production smoke correction: PR #72, reviewed head `10363e732e7dfb83311c09a9ac7f112ca3b68aff`, merge `9f15b2a8e09142ddebfbf6f8a04938c9b3b820dd`.

## Production execution evidence

- Phase 0 deployment: Actions run `31255400150`, success at the Phase 0 merge.
- Phase A deployment: Actions run `31261121732`, success at the Phase A merge.
- Phase B deployment: Actions run `31265821759`, success at the Phase B merge.
- Retirement durability redeploy: Actions run `31268554975`, success at final reviewed source `9f15b2a8e09142ddebfbf6f8a04938c9b3b820dd` after legacy control-plane retirement.
- Strict production smoke before retirement: Actions run `31267101730`, success at final reviewed source.
- Strict production smoke after retirement: Actions run `31268623548`, success at final reviewed source.
- Scoped matrix rows: Actions runs `31267161085`, `31267163270`, `31267165300`, and `31267167610`, all success at final reviewed source.
- Sanitized audit trigger: Actions run `31267442659`, success; independent tail validation passed and the capture was deleted after leakage checks.
- Scoped notification restoration: Actions run `31268128118`, followed by independent verification run `31268209731`, both success.
- Post-retirement content boundary: Actions run `31268653938`, success.

## Sanitized acceptance proof

lifecycleFloorReady=true
fourScopedRowsIsolated=true
sourceFreeRotationPassed=true
auditAllowlistPassed=true
strictConcurrencyMatched=true
transitionSharesMainLimiter=true
legacyRuntimeRejected=true
scopedRevocationIsolated=true
scopedRevocationRestored=true
legacyWorkerSecretAbsent=true
legacyGitHubSecretAbsent=true
legacyDopplerSecretAbsent=true
scopedWorkerSecretsReady=true
genericRedeployDidNotRecreateLegacy=true
releaseGateRemainedFalse=true

## Independent read-back notes

- Historical Phase A middleware was re-tested with the legacy binding absent; every scoped capability remained authorized by its own credential and the historical worktree remained clean afterward.
- The final transition deployment retained exact reward-route ownership and continued to share the main strict limiter while its secret inventory and compatibility setting remained unchanged.
- The final main deployment retained the reviewed application script and non-secret bindings across capability-secret synchronization.
- The legacy credential was rejected by the Phase B runtime before retirement.
- Scoped notification revocation produced isolation from the notification boundary while the independent content boundary remained authorized; notification access was then restored from its protected environment copy.
- Sanitized audit telemetry contained only the approved audit fields, included authorized and rejected outcomes, and contained no scoped or legacy credential value and no malformed request body.
- After retirement, the legacy credential name was absent from Cloudflare, the GitHub production environment, and Doppler; a generic backend redeploy succeeded and did not recreate it.
- The release gate remained disabled throughout the production verification and retirement sequence.
