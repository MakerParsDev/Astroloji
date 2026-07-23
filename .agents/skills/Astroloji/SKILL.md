```markdown
# Astroloji Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill covers the core development patterns and workflows used in the Astroloji Kotlin codebase. You'll learn about the project's coding conventions, file organization, and how to safely update or refactor authentication session refresh logic. The guide also outlines testing practices and provides handy commands for common tasks.

## Coding Conventions

Astroloji follows a set of clear and consistent coding conventions to ensure maintainability and readability.

### File Naming

- **PascalCase** is used for file names.
  - Example: `SessionRefreshCoordinator.kt`, `AuthenticatedRequestExecutor.kt`

### Import Style

- **Alias imports** are used to clarify dependencies.
  - Example:
    ```kotlin
    import com.parsfilo.astrology.core.data.session.SessionTokenStore as TokenStore
    ```

### Export Style

- **Named exports** are used for classes and functions.
  - Example:
    ```kotlin
    class SessionRefreshCoordinator { ... }
    ```

### Commit Message Style

- **Conventional commits** with prefixes like `fix` and `refactor`.
  - Example: `fix: handle token expiry in session refresh`

## Workflows

### Auth Session Refresh Logic Update

**Trigger:** When you need to fix, refactor, or enhance how authentication sessions are refreshed and coordinated.  
**Command:** `/update-auth-session-refresh`

Follow these steps to safely update the session refresh logic:

1. **Edit the core session refresh coordination logic**  
   - Modify `SessionRefreshCoordinator.kt` to update how sessions are refreshed.
   - Example:
     ```kotlin
     class SessionRefreshCoordinator {
         fun refreshSessionIfNeeded() { /* ... */ }
     }
     ```

2. **Optionally update related executors**  
   - Update `AuthenticatedRequestExecutor.kt` if request execution logic changes.

3. **Optionally update related repositories or token stores**  
   - Modify `SessionTokenStore.kt` if token handling needs adjustment.

4. **Update or add tests**  
   - Edit or add tests in:
     - `SessionRefreshCoordinatorTest.kt`
     - `AuthenticatedRequestExecutorTest.kt`
   - Example (using vitest for JS/TS, but in Kotlin use JUnit or similar):
     ```kotlin
     @Test
     fun testSessionRefresh() { /* ... */ }
     ```

5. **Optionally update backend JWT logic and tests**  
   - If backend logic is affected, update corresponding code and tests.

6. **Optionally add or update documentation**  
   - Document any significant changes for future maintainers.

**Files Involved:**
- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/SessionRefreshCoordinator.kt`
- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/AuthenticatedRequestExecutor.kt`
- `Astroloji/app/src/main/java/com/parsfilo/astrology/core/data/session/SessionTokenStore.kt`
- `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/SessionRefreshCoordinatorTest.kt`
- `Astroloji/app/src/test/java/com/parsfilo/astrology/core/data/session/AuthenticatedRequestExecutorTest.kt`

## Testing Patterns

- **Framework:** vitest (for JS/TS parts), but primary Kotlin code uses standard Kotlin testing frameworks (e.g., JUnit).
- **Test File Pattern:** `*.test.ts` for JS/TS, `*Test.kt` for Kotlin.
- **Test Example (Kotlin):**
  ```kotlin
  @Test
  fun testSessionRefreshCoordinator() {
      // Arrange
      val coordinator = SessionRefreshCoordinator()
      // Act
      val result = coordinator.refreshSessionIfNeeded()
      // Assert
      assertTrue(result)
  }
  ```

## Commands

| Command                     | Purpose                                                        |
|-----------------------------|----------------------------------------------------------------|
| /update-auth-session-refresh| Update or fix authentication session refresh coordination logic |
```
