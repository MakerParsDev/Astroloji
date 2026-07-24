# Remove Plaintext Fallback Credentials Design

## Goal

Remove reusable fallback credentials from Android local storage while retaining deterministic session recovery through Firebase-managed session state and anonymous authentication.

## Authentication flow

1. Reuse the current Firebase user when Firebase Auth has restored one.
2. When no Firebase user exists, start an anonymous Firebase session.
3. Do not generate, persist, recover, or retry with an email/password credential pair.
4. When anonymous authentication is unavailable, return the existing safe session error without logging credential material or generating a substitute account.

Firebase Auth remains responsible for its platform-managed token persistence. Application DataStore and Room storage must never contain a reusable password.

## Legacy migration

The `user_preferences` DataStore registers a one-time, idempotent migration. Before normal reads are exposed, it removes the legacy fallback email and password keys while preserving all unrelated preferences. The legacy key definitions remain isolated in the migration file so production code cannot write them.

## Session cleanup

Session invalidation clears the app JWT, in-memory token, cached profile, Firebase local session, and any legacy credential fields that may still be present. Successful account deletion continues to clear the entire DataStore and Room database, signs out Firebase, and clears the in-memory token.

## Testing

Automated tests cover:

- migration detection, legacy-key removal, idempotence, and preservation of unrelated preferences;
- recovery through an existing Firebase user;
- recovery through anonymous sign-in when no user exists;
- failure without email/password fallback when anonymous sign-in is unavailable;
- invalid-session cleanup;
- successful account-deletion cleanup.

Verification output and public documentation remain sanitized and contain no credential values.
