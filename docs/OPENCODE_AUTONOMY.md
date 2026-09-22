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

`config/autonomous-policy.json` is the single source of truth for autonomous merge and repair risk.
It defines:
- high-risk path rules;
- maximum changed-file count;
- maximum changed-line count.

The PR policy, CI repair guard, and local `repo-risk` tool all consume the same policy. Mergify is the repository's only autonomous merge engine.
Documentation filenames containing words such as "release" do not become high risk merely because of a substring match.

The PR policy runs on `pull_request_target` from the trusted base branch, checks out only `pull_request.base.sha`, and never imports or executes policy code from the PR head. It computes the proposed change from the GitHub pull-request files API, then writes an exact-head `autonomous-risk-low` commit status before normalizing labels. It re-runs on opened, synchronized, reopened, labeled, and unlabeled pull-request events. Low-risk heads receive status success plus `risk:low`; high-risk heads receive status failure plus `risk:high` and `needs-human`. Policy/configuration, OpenCode permission/safety, installer/model-selection, and CI-repair control files are themselves high-risk. Label edits performed by the policy use the repository `GITHUB_TOKEN`, so GitHub's recursion suppression prevents those policy-authored label changes from spawning another label workflow run.

Mergify identifies autonomous pull requests from the head branch itself: only `head ~= ^opencode/` is eligible for autonomous auto-merge. Such branches require both `risk:low` and exact-head `autonomous-risk-low=success`, so editing or removing labels cannot change whether a PR is treated as autonomous. Merge protection requires the repository CI, OpenCode review, CodeRabbit, GitGuardian, SonarCloud, and Semgrep checks for every pull request targeting `main`. Pull requests whose head branch does not start with `opencode/` do not require the autonomous risk status. `opencode/*` pull requests additionally require either exact-head `autonomous-risk-low=success` with no high-risk labels, or explicit `human-approved`; high-risk autonomous pull requests are never auto-merged. The policy removes `human-approved` on every `synchronize` event, so a new head SHA always requires a fresh human approval after the new diff and exact-head checks are available. The GitHub `main` branch is configured to require `Mergify Merge Protections`, so direct/API merges cannot bypass that boundary.

## GitHub workflows

- `opencode-command.yml`: trusted collaborator `/oc` commands.
- `opencode-review.yml`: independent same-repository PR review.
- `opencode-triage.yml`: issue triage.
- `opencode-maintenance.yml`: daily bounded maintenance.
- `opencode-security-audit.yml`: weekly read-only security audit.
- `opencode-dependencies.yml`: weekly curated dependency maintenance.
- `opencode-dispatch.yml`: manual maintainer task.
- `opencode-pr-policy.yml`: deterministic autonomous PR risk classification.
- Mergify Merge Protections: the sole autonomous merge/queue controller for low-risk PRs.
- `opencode-ci-repair.yml`: at most two repairs on eligible `opencode/*` low-risk PRs; eligibility requires exact-head `autonomous-risk-low=success`; policy-control changes hard-stop repair; final full-diff risk is evaluated with policy files extracted from the trusted base SHA; it never merges.
- Bootstrap boundary: keep `opencode-ci-repair` disabled at repository level until this hardening change is merged and `main` contains the base-pinned policy/module files; only then re-enable it.
- `opencode-model-canary.yml`: daily free-model/configuration/inference health check.

Autonomous auto-merge requires the exact current head SHA to pass:
- `autonomous-risk-low`;
- `secret-scan`;
- `backend-verify`;
- `android-verify`;
- OpenCode `review`;
- CodeRabbit;
- GitGuardian Security Checks;
- SonarCloud Code Analysis;
- Semgrep;
- zero unresolved review threads.

External review/security checks are intentionally fail-closed. If a provider skips a required check, rate-limits without producing success, or renames its check, Mergify keeps the merge blocked until the integration and configured check name are explicitly verified and updated.

## Tool and shell boundaries

`opencode.jsonc` is deny-by-default for shell execution.
Allowed shell commands are limited to read-only Git inspection and deterministic build/test/lint/typecheck operations.
Git mutations, GitHub mutations, arbitrary command wrappers, deployment CLIs, secret tools, and publishing tasks are denied.
The safety plugin applies a second runtime guard.

Cloudflare Docs MCP is enabled.
Cloudflare Observability MCP is configured but disabled because production telemetry may contain sensitive data.
LSP is enabled for semantic code navigation.

## Supply-chain policy

Every external GitHub Action in every repository workflow is pinned to a full commit SHA. Existing major-version behavior is preserved; Renovate is the controlled update path for later digest or version changes.
Model-running workflows do not use the OpenCode composite GitHub Action because that wrapper dynamically discovers and installs the latest CLI.
Instead, CI downloads the OpenCode 1.18.32 Linux release asset from `anomalyco/opencode`, the GitHub repository linked by opencode.ai as the project's official source repository, verifies its pinned SHA-256 digest before extraction, and runs the pinned `opencode github run` command directly.
A small runner injects only the requested `default_agent` as a final inline config merge, keeps sharing disabled, uses the caller-provided GitHub token, and exposes Git write credentials only as process-local `GIT_CONFIG_*` values for workflows that are allowed to create commits or pull requests. The pinned OpenCode v1.18.32 `githubRun` implementation reads `MODEL` and `PROMPT` directly from the inherited process environment; repository behavior tests verify that both values reach the child `opencode github run` process. The bounded CI-repair push uses the same process-local Git authentication pattern and does not call `gh auth setup-git` or persist credentials in repository Git config.
The v1.18.32 Linux x64 release asset digest was independently recomputed out of band and matched the pinned SHA-256 before this policy was introduced. Renovate tracks repository Action digests and the OpenCode CLI release pin, but never auto-merges dependency updates. A CLI version bump deliberately does not rewrite the digest automatically: the checksum mismatch makes the installer fail closed until a human verifies the new official release asset and updates the reviewed digest.

## Privacy boundary

Free model endpoints can have data-collection terms.
Do not provide personal, confidential, production-customer, credential, purchase-identifier, or raw telemetry data to the agents.
CI repair logs pass through `scripts/sanitize-ci-log.mjs` before model exposure.
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
