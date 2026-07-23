---
name: auth-session-refresh-logic-update
description: Workflow command scaffold for auth-session-refresh-logic-update in Astroloji.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /auth-session-refresh-logic-update

Use this workflow when working on **auth-session-refresh-logic-update** in `Astroloji`.

## Goal

Update or fix the logic related to authentication session refresh coordination and token handling.

## Common Files

- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/SessionRefreshCoordinator.kt`
- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/AuthenticatedRequestExecutor.kt`
- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/SessionTokenStore.kt`
- `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/SessionRefreshCoordinatorTest.kt`
- `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/AuthenticatedRequestExecutorTest.kt`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit core session refresh coordination logic in SessionRefreshCoordinator.kt
- Optionally update related session or authentication executors (AuthenticatedRequestExecutor.kt)
- Optionally update related repositories or token stores
- Update or add tests for affected session/auth logic
- Optionally update backend JWT logic and tests

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.