---
name: git-discipline
description: Standardized Git workflow and commit conventions.
---

# Git Discipline Protocol

1. **ATOMIC COMMITS:**
   - Commit logically isolated changes. Each commit should address a single task or milestone.

2. **CONVENTIONAL COMMIT MESSAGES:**
   - Format: `<type>: <concise description>`
   - Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`.
   - Example: `feat: implement LERP smoothing for hand landmarks`

3. **VERIFICATION BEFORE COMMIT:**
   - Always run linter, type-check, and tests before creating a commit.
   - Do not commit broken or unverified code.
