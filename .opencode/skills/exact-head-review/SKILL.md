---
name: exact-head-review
description: Enforce exact-SHA review evidence and invalidate stale checks after every pushed fix.
---
# Exact-head review
For any merge recommendation:
- identify the current PR head SHA;
- verify review findings and CI/security evidence apply to that exact SHA;
- any new commit invalidates prior review/check evidence;
- ensure the PR is same-repository unless explicitly handled as untrusted;
- ensure unresolved material review threads are addressed;
- inspect the final diff after all fixes.
Never treat green checks from an older SHA as evidence for the current head.
