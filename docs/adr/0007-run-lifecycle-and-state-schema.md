# Run lifecycle and state schema

Each run has a lifecycle status and a canonical `state.json` under its run directory.
Active-run resolution only considers active runs unless the user explicitly selects another run.
We chose this because pi-herd must support multiple parallel runs without guessing the target when commands omit `--run`.

Slice 2 implements the first schema version.
`pi-herd run create` writes `schema_version: 1`, a timestamp-plus-slug `run_id`, a human-friendly `run_slug`, the original goal, lifecycle timestamps, repository root, base ref, canonical run directory, a lead binding placeholder, and selected role records.
The initial selected roles default to `planner`, `implementer`, `reviewer`, and `tester`, or can be limited with repeated `--role` flags.
Role records start as `pending` with `worktree_path: null` and `worktree_status: pending` because Slice 2 does not create worktrees, panes, or sessions.

Run state writes are atomic: pi-herd writes a temporary JSON file in the run directory and renames it into place.
Configured `paths.runs_dir` values must be repository-relative, remain inside the repository root, and avoid symlink path components before state is written.
