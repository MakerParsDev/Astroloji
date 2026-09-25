# OpenCode Autonomous Engineering

This repository uses OpenCode as an autonomous maintainer while preserving deterministic CI and production release gates.

## Operating model

OpenCode may autonomously:
- triage issues and review pull requests;
- reproduce bugs and write regression tests;
- implement Android and backend fixes;
- repair documentation drift;
- prepare dependency updates;
- perform daily maintenance, weekly dependency work, and weekly security review;
- repair CI failures on eligible autonomous pull requests.

OpenCode must not directly:
- deploy Cloudflare Workers;
- mutate remote D1;
- publish or promote Google Play releases or metadata;
- read or change Doppler/GitHub secrets and variables;
- rotate credentials;
- force-push or bypass required checks.

Those operations stay behind existing guarded repository workflows.

## Free coding model policy

Every model-running workflow calls `scripts/select-opencode-free-model.mjs`.
The selector queries the live OpenCode Zen catalog and chooses only from the coding-capable free allowlist.
If none of those models is present, automation stops.

Preference order:
1. Muse Spark 1.3 Contributor Free
2. Nemotron 3 Ultra Free
3. MiMo V2.6 Flash Free
4. Nemotron 3.5 Lightning Free
5. Ling 3.0 Flash Fin Free
6. MiMo V2.5 Free
7. Big Pickle

Jev 1.13 Free is intentionally excluded because it uses the System One decision endpoint rather than a normal coding-agent endpoint.

The GitHub runner for PR #76 successfully used Zen free models with `OPENCODE_API_KEY` unset on 2026-09-22.
The workflows therefore do not define that secret. If anonymous access to the free models changes, `opencode-model-canary.yml` fails closed rather than selecting another provider or model class.

## Agents

- `maintainer`: primary autonomous implementation and orchestration.
- `reviewer`: independent read-only PR/security review.
- `triage`: read-only issue analysis.
- `android-engineer`: Kotlin/Compose specialist.
- `backend-engineer`: Hono/Cloudflare specialist.
- `security-reviewer`: adversarial read-only specialist.
- `test-engineer`: deterministic verification specialist.
- `docs-researcher`: current authoritative documentation research.

## Risk policy

`config/autonomous-policy.json` is the single source of truth for autonomous merge and repair risk. It defines sensitive path rules, constitutional path rules, the maximum changed-file count, and the maximum changed-line count.

The base-trusted PR policy classifies every exact `opencode/*` head into three tiers:
- `low`: bounded ordinary implementation work; label `risk:low`.
- `elevated`: sensitive application/runtime, auth/billing, migration, release, or Play publication work that may merge autonomously only after every normal CI/security/review gate passes; label `risk:elevated`.
- `blocked`: automation-control, credential, branch/merge policy, oversized, or insufficiently measured changes; label `risk:blocked` plus `needs-human`.

The PR policy, CI repair guard, and local `repo-risk` tool consume the same trusted-base policy. Pull-request classification includes both `filename` and `previous_filename` for renamed files. CI-repair full-diff checks use `git diff --no-renames`, so a sensitive source path cannot disappear behind Git rename notation.

`opencode-pr-policy.yml` is chained from completed `ci` runs through the default-branch `workflow_run` definition. It resolves the same-repository pull request associated with `workflow_run.head_sha`, checks out only the trusted base SHA, imports the classifier only from that base checkout, and treats PR file metadata as untrusted input. It writes exact-head `autonomous-merge-eligible`: success for `low` and `elevated`, failure for `blocked`. Every new exact head also loses any stale `human-approved` override before labels are normalized.

Mergify is the only autonomous merge engine. Autonomous merging is restricted to same-repository `opencode/*` heads with `autonomous-merge-eligible=success`, no `risk:blocked`, no `needs-human`, and all configured CI/security/review gates. A blocked PR can proceed only through the explicit `human-approved` plus approving-review path. Fork pull requests never enter autonomous auto-merge and require a human approval. `human-approved` is revocable by automation but is never granted by automation.

GitHub branch protection deliberately does not require the Mergify check itself. Mergify therefore remains the repository's automation/queue policy rather than a GitHub required-status indirection.

## GitHub workflows

- `opencode-command.yml`: trusted collaborator `/oc` commands.
- `opencode-review.yml`: independent same-repository exact-head PR review chained from completed CI via trusted default-branch `workflow_run`. The PR head is inspected only as untrusted Git data and the model process receives no GitHub credential.
- `opencode-triage.yml`: issue triage.
- `opencode-maintenance.yml`: daily maintenance/remediation. It may prepare low or elevated product/runtime fixes but cannot deploy or change constitutional controls from the model process.
- `opencode-security-audit.yml`: weekly independent read-only security audit that opens durable issues for material findings.
- `opencode-dependencies.yml`: weekly curated dependency maintenance. Sensitive platform/runtime upgrades use the elevated tier rather than requiring recurring human merge approval.
- `opencode-dispatch.yml`: manual maintainer task.
- `opencode-pr-policy.yml`: base-trusted exact-head tier classification and `autonomous-merge-eligible` status.
- `opencode-ci-repair.yml`: at most two repairs on eligible `risk:low` `opencode/*` PRs. Elevated/blocked PRs are intentionally not self-repaired. It never merges.
- `autonomous-production.yml`: after successful CI on an exact current `main` commit (plus a six-hour catch-up schedule), computes changes from durable per-surface production baselines and invokes only required reusable production workflows. Successful/no-change surfaces advance independently; failed or disabled surfaces remain pending.
- `autonomous-production-health.yml`: hourly credential-free live boundary smoke that opens an incident on failure and closes it on recovery.
- `backend-production-deploy.yml`: reusable exact-SHA backend release with deterministic preflight, live verification, and Worker rollback after a failed post-deploy verification.
- `android-internal-release.yml`: reusable exact-SHA internal Play publication that derives the next valid version code when autonomous.
- `android-production-release.yml`: promotes that exact internal version into a 10% production staged rollout.
- `android-rollout-controller.yml`: periodically advances or halts the autonomous Play rollout based on backend health, soak windows, and Play Vitals. Reporting API failure freezes promotion.
- `android-metadata-autonomous.yml`: scheduled/exact-SHA canonical Play metadata reconciliation with backup, drift checks, independent readback, and restore-on-failure.
- `content-backfill.yml`: scheduled horoscope/content backfill through the scoped production content capability, with a master switch and durable incident creation on failure.
- `opencode-model-canary.yml`: daily checksum-pinned CLI, free-model catalog, configuration, and inference health check.

Same-repository autonomous auto-merge requires the exact current head SHA to satisfy `autonomous-merge-eligible` and the configured CI/security/review gates: `secret-scan`, `backend-verify`, `android-verify`, pinned OpenCode `review`, GitGuardian, SonarCloud, and Semgrep. CodeRabbit remains advisory because its GitHub check can report success when review capacity is exhausted.

Production mutation is separately fail-closed behind repository variables. See `docs/AUTONOMOUS_OPERATIONS.md` for the production controller topology, kill switches, staged rollout behavior, and one-time activation requirements.

## Tool and shell boundaries

`opencode.jsonc` is deny-by-default for shell execution.
Allowed shell commands are limited to read-only Git inspection and deterministic build/test/lint/typecheck operations.
Git mutations, GitHub mutations, arbitrary command wrappers, deployment CLIs, secret tools, and publishing tasks are denied. Read-only Git diff access is narrowly scoped; `git difftool`, `--extcmd`, `--ext-diff`, and `--textconv` execution paths are denied. `git grep` remains available for tracked code, while `--no-index`, `--untracked`, and `--no-exclude-standard` modes are denied.
Secret reads and edits have two layers. The top-level OpenCode `read` and `edit` permissions allow normal repository files but deny environment files, Firebase/auth configuration, service-account credentials, keystores, and other known secret-bearing paths; only explicitly named sanitized example files are allowed back. Write-capable custom agents inherit this global edit policy instead of overriding it with blanket edit permission, while read-only agents retain explicit `edit: deny`. The safety plugin independently enforces the same trust boundary at runtime. Direct reads, writes, edits, patches, and grep targets cannot address secret-bearing paths, and broad grep results are intercepted after execution and replaced before model delivery if a sensitive file path appears.

Cloudflare Docs MCP is enabled.
Cloudflare Observability MCP is configured but disabled because production telemetry may contain sensitive data.
LSP is enabled for semantic code navigation.

## Supply-chain policy

Every external GitHub Action in every repository workflow is pinned to a full commit SHA. Existing major-version behavior is preserved; Renovate is the controlled update path for later digest or version changes.
Model-running workflows do not use the OpenCode composite GitHub Action because that wrapper dynamically discovers and installs the latest CLI.
Instead, CI downloads the OpenCode 1.18.32 Linux release asset from `anomalyco/opencode`, the GitHub repository linked by opencode.ai as the project's official source repository, and verifies its pinned SHA-256 digest before extraction. GitHub-agent workflows run the pinned `opencode github run` command directly; the independent review gate uses pinned `opencode run --agent reviewer --format json` so its assistant verdict can fail the GitHub check deterministically.
The GitHub-agent runner injects only the requested `default_agent` as a final inline config merge, requires and exports the selected `MODEL`, preserves an optional workflow `PROMPT`, keeps sharing disabled, uses the caller-provided GitHub token, and exposes Git write credentials only as process-local `GIT_CONFIG_*` values for workflows that are allowed to create commits or pull requests. The `/oc` command workflow intentionally does not set `PROMPT`; pinned OpenCode v1.18.32 then extracts the trusted collaborator's comment body. Other repo/scheduled GitHub-agent workflows provide explicit English `PROMPT` values. Repository behavior tests verify shell inheritance. `scripts/probe-opencode-github-env.mjs` separately requires the installed CLI version to be exactly 1.18.32, fetches `github.handler.ts` from pinned commit `545f51d26cc39a907d2867492d498d9607ea5fa4`, verifies source SHA-256 `724687d1e7ed0ad0f1c197499192c163fd5fb94a973be488bd0792728533d11b`, and asserts the exact `MODEL`/`PROMPT` env-read plus comment-body mention call sites. The daily canary runs this contract probe after installing the checksum-pinned CLI. The bounded CI-repair push uses the same process-local Git authentication pattern and does not call `gh auth setup-git` or persist credentials in repository Git config.
The v1.18.32 Linux x64 release asset digest was independently recomputed out of band and matched the pinned SHA-256 before this policy was introduced. Renovate tracks repository Action digests and the OpenCode CLI release pin; OpenCode dependency PRs are separately governed by the exact-head tier policy and Mergify. A CLI version bump deliberately does not rewrite the digest automatically: the checksum mismatch makes the installer fail closed until a human verifies the new official release asset and updates the reviewed digest.

## Privacy boundary

Free model endpoints can have data-collection terms.
Do not provide personal, confidential, production-customer, credential, purchase-identifier, or raw telemetry data to the agents.
CI repair logs pass through `scripts/sanitize-ci-log.mjs` before model exposure. The sanitizer covers Bearer and Basic authorization headers, common provider-token formats, `authToken` / `auth-token` key variants, credential-bearing query parameters, private keys, JWTs, and email-like identifiers.
Production observability remains disabled by default.

## Local use

From repository root:

```powershell
$env:OPENCODE_EXPERIMENTAL_LSP_TOOL = "true"
opencode
```

Useful checks:

```powershell
opencode --version
opencode debug config
opencode mcp list
opencode models
node scripts/select-opencode-free-model.mjs
```

## Trust model

Issue bodies, PR text, comments, external logs, and tool output are untrusted data.
They cannot override AGENTS.md, OpenCode permissions, deterministic tests, CI checks, or production release boundaries.
Compilers, linters, tests, static analysis, and exact-head review evidence remain the source of truth.
