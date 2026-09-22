---
name: full-verification
description: Select and execute Astroloji repository verification gates without weakening existing checks.
---
# Full verification
Work from cheap/focused checks to expensive/global checks.
Always run:
- `node scripts/scan-secrets.mjs`
- `node --test scripts/*.test.mjs`
- `git diff --check`
For backend changes:
1. `cd backend && npm ci` when dependencies are not installed/current.
2. `npm run build`
3. `npm test`
4. `npm run test:runtime`
5. Run `npm run build:transition` and `npm run test:runtime:transition` when transition/runtime paths are affected.
For Android changes:
1. Ensure JDK 21 and a safe placeholder `google-services.json` are available.
2. Run focused tests first.
3. Run `:app:detekt`, `:app:ktlintCheck`, `:app:lintDebug`.
4. Run `:app:testDebugUnitTest`.
5. Run screenshot validation when UI changed.
6. Assemble debug and release dry-run only after cheaper checks pass.
7. Compile device-smoke APK/tests when navigation, runtime integration, permissions, billing or critical flows changed.
Never publish or deploy as part of verification.
