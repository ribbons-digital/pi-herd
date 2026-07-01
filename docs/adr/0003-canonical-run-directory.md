# Canonical run directory outside worker worktrees

A run has one canonical artifact directory under the main checkout at `.pi-herd/runs/{run_id}`.
Workers use role worktrees for source operations but write artifacts to this shared run directory.
We chose this because per-worktree artifact copies make collection ambiguous, while a shared run directory keeps handoff files and summaries canonical.
