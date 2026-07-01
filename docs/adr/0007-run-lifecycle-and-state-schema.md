# Run lifecycle and state schema

Each run has a lifecycle status and a canonical `state.json` under its run directory.
Active-run resolution only considers active runs unless the user explicitly selects another run.
A run can be marked `failed` when creation or orchestration fails after the run directory exists.
We chose this because pi-herd must support multiple parallel runs without guessing the target when commands omit `--run`.

Slice 2 implements the first schema version.
`pi-herd run create` writes `schema_version: 1`, a timestamp-plus-slug `run_id`, a human-friendly `run_slug`, the original goal, lifecycle timestamps, repository root, base ref, canonical run directory, a lead binding placeholder, and selected role records.
The initial selected roles default to `planner`, `implementer`, `reviewer`, and `tester`, or can be limited with repeated `--role` flags.
Role records start as `pending` with `worktree_path: null`, `worktree_status: pending`, and `worktree_provider: null` before optional worktree materialization.
Slice 3 updates selected role records to `worktree_status: materialized` with `worktree_path` and `worktree_provider` when `--with-worktrees` or `--planner-worktree` materializes them.
`herdr_workspace_id` is recorded only when Herdr-managed materialization succeeds; raw `git worktree add` fallback records `worktree_provider: git` and leaves `herdr_workspace_id: null`.
Raw git fallback is allowed only after Herdr creation exits nonzero or fails to spawn; Herdr timeouts and successful Herdr creation with unusable, missing, or mismatched metadata fail clearly instead of attempting fallback against the same target.
If materialization fails, pi-herd persists the latest state, keeps any successful role materializations, marks the run `failed`, and excludes it from active-run resolution.

Run state writes are atomic: pi-herd writes a temporary JSON file in the run directory and renames it into place.
Configured `paths.runs_dir` values must be repository-relative, remain inside the repository root, and avoid symlink path components before state is written.
