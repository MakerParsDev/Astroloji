# Autonomous Operations

This repository is designed to run as a closed-loop product operation system once its explicit kill switches are enabled.

## Operating model

The model-facing workflows may inspect code, propose patches, open pull requests, review exact PR heads, and repair bounded low-risk CI failures. They do not receive production credentials. Production credentials are only exposed inside deterministic release/reconciliation workflows attached to protected GitHub environments.

The control loop is:

1. Scheduled maintenance, dependency, and security workflows discover justified work.
2. Changes are proposed on `opencode/*` branches.
3. CI, secret scanning, static analysis, and an independent exact-head review run.
4. The base-trusted PR policy classifies each exact head as `low`, `elevated`, or `blocked`.
5. Mergify is the only autonomous merge engine. It can merge only same-repository `opencode/*` heads whose exact head is merge-eligible and whose configured CI/security/review gates pass.
6. A successful CI run on an exact current `main` commit creates an immutable production release plan. A scheduled six-hour reconciliation also catches up when no new commit arrives.
7. Backend changes deploy through the production workflow, run live verification, and roll back the Worker if post-deploy verification fails.
8. Android changes publish first to the Play internal track, then promote the exact version to a 10% production staged rollout.
9. The rollout controller periodically reconciles Play state. It mutates only the exact autonomous Play release name recorded by the machine-owned production-state issue after a successful production publication; a lookalike or manually named release is never adopted. It advances 10% -> 25% -> 50% -> 100% only after soak windows and Play Vitals checks. It halts on backend-health or crash/ANR threshold failures and freezes promotion if Play Developer Reporting is unavailable.
10. Play listing/image metadata is reconciled from the canonical repository state using a fresh live backup, drift checks, post-commit read-back, and restore-on-failure.
11. Daily horoscope content backfill generates and quality-checks upcoming content through the backend content pipeline.
12. An hourly credential-free production watchdog continuously verifies health, legal pages, and unauthenticated auth/admin boundaries; it opens a durable incident on failure and closes it after recovery.
13. The controller stores separate backend, Android, and Play-metadata baselines in a machine-owned `Autonomous production state` issue. A surface advances only after its work succeeds (or when no change exists for that surface), so disabled switches, cancelled intermediate runs, stale SHAs, and partial failures cannot silently lose pending production work.
14. Failures create durable GitHub incidents that later maintenance runs can consume.

## Risk tiers

`low` covers bounded ordinary implementation work. `elevated` covers sensitive product/runtime changes such as auth, billing, migrations, Android manifest/runtime, Cloudflare runtime configuration, and Play publication state. These may merge autonomously only after every deterministic external gate succeeds.

`blocked` covers the automation trust boundary itself: GitHub workflows, Mergify policy, OpenCode/safety policy, autonomous-policy configuration, credential material, oversized changes, or changes whose size cannot be measured. These never self-merge.

This boundary is deliberate: routine product, dependency, security, backend, Android, billing/auth, migration, Play, and content maintenance can be unattended, while the system cannot remove or rewrite the rules that constrain its own privileges.

## Kill switches

Production mutation remains disabled unless explicitly enabled in repository variables. Disabled Android or metadata switches do not discard their pending baseline; later scheduled reconciliation catches up after the switch is enabled.

- `ENABLE_AUTONOMOUS_PRODUCTION=true`: master switch for automatic production orchestration.
- `ENABLE_PRODUCTION_RELEASE=true`: permits Android production publication and staged-rollout reconciliation.
- `ENABLE_METADATA_PUBLISH=true`: permits autonomous Play metadata reconciliation.
- `ENABLE_CONTENT_BACKFILL=true`: permits scheduled horoscope content backfill.

Manual release workflows remain available as break-glass paths.

## Release safety

Production workflows use an exact 40-character `main` SHA and fail closed if `main` moves before mutation starts. Model processes never receive Play, Cloudflare, Doppler, signing, or production-admin credentials.

Android production starts staged. The exact generated `auto-v1-*` release name plus its publication SHA is returned by the reusable publication workflow and persisted only after the production job succeeds. The scheduled rollout controller requires that exact machine-owned provenance before any mutation. A halted rollout is never automatically resumed. Missing provenance, missing reporting permissions, or unavailable Play Vitals freezes promotion instead of treating missing evidence as healthy.

Backend deployment verifies build/tests before mutation and live health/legal/auth boundaries afterward. If the Worker was deployed successfully but post-deploy verification fails, the workflow invokes Wrangler rollback and verifies health again. Database migrations are not automatically reversed. CI validates the full PR/push migration range, not merely the last commit. Before production D1 mutation, the release workflow also validates the full backend catch-up range and reads `d1_migrations` with SELECT-only queries to compute the actual remote pending set; every pending file must pass the same expand-only policy. Editing/deleting an applied migration, unsafe DML, triggers/unique-index creation, destructive DDL, unsafe ALTER forms, or PRAGMA is blocked. Direct production SQL helpers are regression-tested with the same classifier.

Play metadata reconciliation uses the repository as canonical state but refuses unexpected locale deletion or rollout/subscription drift. Every mutation begins with a fresh backup and uses independent read-back; failed publication attempts restore from that backup if live state changed.

## Content operations

Scheduled content backfill uses the scoped production admin-content capability and the backend's existing deterministic content/quality pipeline. The content switch can disable this independently of application releases. Failure opens or updates a durable GitHub incident rather than silently retrying indefinitely.

## One-time activation

Keep all production switches false while installing or reviewing this control plane. After this change is merged and its `main` CI is green, an operator can enable only the desired switches. No recurring manual approval is required for ordinary operation after activation; only `blocked` constitutional changes stop for human control.
