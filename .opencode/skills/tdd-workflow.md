---
name: tdd-workflow
description: Test-Driven Development workflow for reliable, verifiable code implementation.
---

# Test-Driven Development (TDD) Workflow

When implementing new features or fixing bugs, follow this strict cycle:

1. **RED - Write Failing Test First:**
   - Define expected input, output, and behavior.
   - Run the test suite to confirm the test fails for the expected reason.

2. **GREEN - Minimal Implementation:**
   - Write the simplest code necessary to pass the test.
   - Do not write extra features or premature optimizations.
   - Re-run the test to confirm it passes.

3. **REFACTOR - Clean & Optimize:**
   - Refactor code for readability, performance, and adherence to project architecture.
   - Ensure all tests continue to pass after refactoring.

4. **VERIFY & COMMIT:**
   - Execute project linter and full test suite.
   - Create an atomic git commit on success.
