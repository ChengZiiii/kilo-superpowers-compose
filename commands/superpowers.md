---
description: |
  Start the Superpowers workflow. Loads the using-superpowers discipline
  rules, then hands the user's request to the compose orchestrator agent,
  which classifies the task (simple / complex / bug) and drives the full
  brainstorming → planning → subagent implementation → two-stage review
  → merge pipeline.
agent: compose
---

# /superpowers

You are being launched via the `/superpowers` slash command. Follow these
steps in order:

1. **Bootstrap discipline (mandatory first step).** Load the
   `using-superpowers` skill before doing anything else. This installs the
   core rules that govern all subsequent work in this session.

2. **Hand off to the compose workflow.** Treat the user's request (the
   text they supplied after `/superpowers`, or the most recent message if
   none) as the task to process. Run the compose orchestrator's workflow
   decision tree:
   - Classify the task: **simple**, **complex**, or **bug fix**.
   - For complex work: brainstorm → plan → get explicit user approval →
     dispatch `compose-dev` per task → dispatch `compose-review` →
     finish the branch.
   - For bugs: `systematic-debugging` first, then a failing test, then
     the simple or complex path based on fix size.
   - For simple work: do it directly, then invoke
     `verification-before-completion` before reporting done.

3. **Never skip the gates.** Brainstorming for new features, TDD for any
   logic, systematic debugging for bugs, and review before merge on
   complex work are mandatory — not suggestions.

Begin by loading `using-superpowers`, then emit the task classification
checkpoint so the user can see your reasoning.
