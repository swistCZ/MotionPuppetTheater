---
name: code-review
description: Code quality, security, and architectural review protocol.
---

# Code Review Protocol

Before committing or submitting changes:

1. **SECURITY & PRIVACY:**
   - Ensure no credentials, API keys, or sensitive environment variables are committed.
   - Validate and sanitize external inputs (e.g., user inputs, camera streams, file uploads).

2. **ARCHITECTURE & CONVENTIONS:**
   - Verify strict separation of concerns (e.g. CV tracking vs math/gestures vs graphics renderer).
   - Enforce typing and code style consistent with project guidelines.

3. **PERFORMANCE & CLEANUP:**
   - Avoid memory leaks (e.g., unremoved event listeners, unclosed video streams, leaky canvas buffers).
   - Remove unused imports, debugging statements, and dead code.
