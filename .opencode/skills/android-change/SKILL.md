---
name: android-change
description: Test-first procedure for Kotlin, Jetpack Compose, Android platform, billing, Firebase and navigation changes.
---
# Android change procedure
1. Read AGENTS.md and the relevant Android code/tests.
2. Use LSP to map definitions, references and call hierarchy when available.
3. Identify behavior contracts: navigation, lifecycle, state restoration, billing, premium/ad gating, analytics/privacy and backend API compatibility.
4. Add a focused RED regression test before changing behavior.
5. Implement the smallest fix.
6. Run focused tests, then Detekt/ktlint/lint.
7. For Compose visual changes, run screenshot regression validation.
8. For runtime/navigation/integration changes, compile device-smoke artifacts.
9. Never invoke Play publishing tasks.
