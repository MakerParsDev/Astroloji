---
name: incident-response
description: Evidence-driven production incident investigation without exposing customer data or granting production write access.
---
# Incident response
1. Start from sanitized evidence: exception type, stack trace, app/backend version, aggregate counts and timestamps.
2. Do not ingest customer rows, tokens, FCM IDs, purchase identifiers, raw request bodies or secrets.
3. Correlate the failure to code and recent commits.
4. Reproduce locally with a deterministic regression test whenever possible.
5. Fix locally and run the relevant verification gates.
6. Produce a PR plus a concise root-cause/rollback note.
7. Production remediation remains behind existing deployment/environment approval controls.
