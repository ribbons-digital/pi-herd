# Canonical run directory outside worker worktrees

A run has one canonical artifact directory under the main checkout at `.pi-herd/runs/{run_id}`.
Workers use role worktrees for source operations but write artifacts to this shared run directory.
We chose this because per-worktree artifact copies make collection ambiguous, while a shared run directory keeps handoff files and summaries canonical.

Slice 2 creates the canonical directory during `pi-herd run create`.
The initial contents are `REQUEST.md`, `state.json`, `logs/`, and `inbox/`.
Slice 3 may then materialize selected role worktrees outside the canonical run directory and update `state.json` with their paths, branches, provider-derived workspace ids, and materialization status.
Slice 4 may launch lead, planner, and implementer sessions while still pointing workers at this shared run directory for artifacts.
The planner kickoff asks for `PLAN.md` in the canonical run directory, not inside a worker worktree.
Slice 6 top-level `collect` writes bounded pane logs under `logs/` and generates `FINAL_SUMMARY.md` from role verdicts, artifact excerpts, and provenance.
Slice 7 repeated-pass validation treats a canonical artifact as stale when it is older than the role's latest activity timestamp.
Slice 8 `merge-plan` writes `MERGE_DECISION.md` in the canonical run directory with provenance, diff context, role verdict context, artifact excerpts, warnings, and manual merge steps.
Worker artifacts such as `IMPLEMENTATION_NOTES.md`, `REVIEW.md`, and `TEST_REPORT.md` also live in this directory as their roles run.
