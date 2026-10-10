# Manual engineering and automated dependency assurance

The project is maintained by its owners. Scheduled/interactive OpenCode
maintenance, dependency curation, security-audit/triage, CI-repair, command,
dispatch and model-canary bot workflows were retired in October 2026. No
unattended AI bot is authorized to modify code, produce issues, or create PRs.

## Independent PR review is a quality gate, not a maintainer bot

The retained `.github/workflows/opencode-review.yml` runs after `ci` and
reviews the **exact PR head** against a trusted base checkout. It never
executes code from the PR head. Its model subprocess receives no GitHub
credentials and cannot commit, push, deploy or publish. It publishes the
`review` commit status and a finding report; BLOCK prevents merging.

## Dependency and security update policy

GitHub-native Dependabot is the **sole automated dependency updater**.
`.github/dependabot.yml` covers backend npm, Android Gradle and pinned
GitHub Actions, with weekly Istanbul-local checks, grouped compatible
non-major upgrades and one outstanding version-update PR per ecosystem.
Dependabot's vulnerability alerts/security updates must also be enabled in
repository security settings; the YAML alone does not switch them on.

Mergify automatically merges only eligible `dependabot[bot]` PRs after
**all** exact-head backend and Android CI, secret scan, SonarCloud,
GitGuardian, Semgrep Cloud and independent review checks succeed, with no
unresolved review threads. Major upgrades, workflow/control-plane changes,
Android toolchain/build files, backend runtime code and D1 migrations are
**not** auto-merged. Failed/incomplete checks leave the PR open for owner
maintenance. Security fixes requiring a major upgrade remain reviewable;
security PRs must never bypass the normal quality checks.

Production deployment, signing and release flags remain separate and are
not activated by PR merges. Before backend deployment, verify and apply
pending additive D1 migrations under the protected release workflow; a
successful repository merge does not imply the deployed Worker is current.
