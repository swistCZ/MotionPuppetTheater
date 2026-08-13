---
name: project-state-persistence
description: Protocol for maintaining PROJECT_STATE.md across sessions.
---

# Project State Persistence Protocol

1. **INITIAL RECOVERY:**
   - At session start, check for `PROJECT_STATE.md`. If present, read it to restore context, goals, and active sub-tasks.
   - If absent, generate `PROJECT_STATE.md` immediately based on `PROJECT_SPEC.md` or initial requirements.

2. **CONTINUOUS SYNCHRONIZATION:**
   - Update `PROJECT_STATE.md` immediately after completing any atomic milestone or sub-task.
   - Maintain sections: Overall Goal & Architecture, Completed Milestones, Active Task & Next Steps, Known Issues / Tech Debt.

3. **SESSION END CHECKPOINT:**
   - Ensure all completed work is reflected in `PROJECT_STATE.md` and committed to git before ending a session.
