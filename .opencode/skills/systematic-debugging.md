---
name: systematic-debugging
description: Systematic debugging protocol for root-cause analysis and bug resolution.
---

# Systematic Debugging Protocol

When encountering bugs, errors, or unexpected behavior:

1. **REPRODUCE & ISOLATE:**
   - Reproduce the failure consistently with a minimal test case or script.
   - Do not guess or apply random fixes without understanding the root cause.

2. **INSPECT & LOG:**
   - Read full stack traces and error messages carefully.
   - Insert targeted log statements or inspect state variables at boundary points.

3. **HYPOTHESIZE & TEST:**
   - Formulate a clear hypothesis about why the failure occurs.
   - Test one hypothesis at a time by making targeted inspections or small code changes.

4. **FIX ROOT CAUSE:**
   - Address the underlying architectural or logic issue rather than patching symptom symptoms.
   - Add a regression unit test covering the bug to prevent future regressions.
