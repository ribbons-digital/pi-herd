# Canonical run directory outside worker worktrees

A run has one canonical artifact directory under the main checkout at `.pi-herd/runs/{run_id}`.
Workers use role worktrees for source operations but write artifacts to this shared run directory.
We chose this because per-worktree artifact copies make collection ambiguous, while a shared run directory keeps handoff files and summaries canonical.

Slice 2 creates the canonical directory during `pi-herd run create`.
The initial contents are `REQUEST.md`, `state.json`, `logs/`, and `inbox/`.
Slice 3 may then materialize selected role worktrees outside the canonical run directory and update `state.json` with their paths, branches, provider-derived workspace ids, and materialization status.
Slice 4 may launch lead, planner, and implementer sessions while still pointing workers at this shared run directory for artifacts.
The planner kickoff asks for `PLAN.md` in the canonical run directory, not inside a worker worktree.
Future slices add worker artifacts such as `IMPLEMENTATION_NOTES.md`, `REVIEW.md`, `TEST_REPORT.md`, `FINAL_SUMMARY.md`, and `MERGE_DECISION.md` as their roles run.
