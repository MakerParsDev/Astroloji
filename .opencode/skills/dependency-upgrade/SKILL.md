---
name: dependency-upgrade
description: Safe dependency upgrade procedure using exact installed versions, authoritative docs, changelogs and repository-wide verification.
---
# Dependency upgrade
1. Read current pins from the actual manifest/version catalog; do not trust documentation copies.
2. Check authoritative release notes/changelog for every major/minor upgrade.
3. Check compatibility between AGP/Gradle/Kotlin/KSP/Compose for Android and Wrangler/TypeScript/Vitest/runtime APIs for backend.
4. Never combine unrelated major upgrades unless required by compatibility.
5. Update AGENTS.md approved-dependency table only after verification succeeds.
6. Run all affected compile/lint/test/screenshot/runtime gates.
7. For security overrides, confirm the advisory and that the override remains inside a compatible major.
8. Never auto-merge major platform, auth, billing or release-tool upgrades.
