---
name: security-sensitive-change
description: Mandatory threat-model and independent review procedure for auth, secrets, webhooks, billing, rate limiting, CI and production-control changes.
---
# Security-sensitive change
Treat changes touching auth, admin capabilities, billing, RTDN/SSV, secrets, CI tokens, production workflows, rate limits or database migrations as high risk.
Before implementation:
- define assets and trust boundaries;
- identify attacker-controlled inputs;
- identify replay/concurrency/idempotency failure modes;
- preserve fail-closed behavior;
- define rollback.
During implementation:
- write negative tests first;
- validate issuer/audience/package/identity where relevant;
- avoid raw secrets, tokens, purchase data or PII in logs/evidence;
- use least privilege.
Before completion:
- invoke security-reviewer independently;
- run secret scan and relevant deterministic security checks;
- never merge directly or perform production mutations from the model process;
- follow the trusted centralized autonomous risk tier: `elevated` changes may be merged only by the guarded merge engine after every configured gate passes, while `blocked`/constitutional changes require explicit human control.
