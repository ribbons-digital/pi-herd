# Canonical run directory outside worker worktrees

A run has one canonical artifact directory under the main checkout at `.pi-herd/runs/{run_id}`.
Workers use role worktrees for source operations but write artifacts to this shared run directory.
We chose this because per-worktree artifact copies make collection ambiguous, while a shared run directory keeps handoff files and summaries canonical.

Slice 2 creates the canonical directory during `pi-herd run create`.
The initial contents are `REQUEST.md`, `state.json`, `logs/`, and `inbox/`.
Future slices add worker artifacts such as `PLAN.md`, `IMPLEMENTATION_NOTES.md`, `REVIEW.md`, `TEST_REPORT.md`, `FINAL_SUMMARY.md`, and `MERGE_DECISION.md` as their roles run.
