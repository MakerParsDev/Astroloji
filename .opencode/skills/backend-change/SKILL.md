---
name: backend-change
description: Test-first procedure for Hono, Cloudflare Workers, D1, R2, KV, Durable Objects and API changes.
---
# Backend change procedure
1. Read AGENTS.md, backend package scripts and relevant runbooks.
2. Use TypeScript LSP to map definitions/references.
3. For Cloudflare-specific behavior, consult current Cloudflare Docs MCP/official docs before coding.
4. Preserve public API paths and authentication/rate-limit contracts.
5. Add a focused failing Vitest/runtime test.
6. Implement the minimum change.
7. Run `npm run build`, focused tests, full unit tests and runtime tests.
8. Include transition gates when transition worker/config is affected.
9. For D1 schema changes, require additive/backward-compatible migration design and local tests. Never mutate remote D1.
10. Never deploy Workers.
