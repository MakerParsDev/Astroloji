---
name: release-safety
description: Prepare Android/Cloudflare production releases while keeping all live mutations behind repository release gates.
---
# Release safety
You may inspect release workflows, validate manifests, calculate version requirements, prepare release notes, verify local artifacts and write rollback plans.
You may not:
- run `wrangler deploy`;
- execute remote D1 mutations;
- run Play publish/promote Gradle tasks;
- download or reveal Doppler secrets;
- rotate credentials;
- dispatch production workflows.
A release-ready result is a reviewed commit/PR plus exact commands/inputs for the existing guarded workflow.
