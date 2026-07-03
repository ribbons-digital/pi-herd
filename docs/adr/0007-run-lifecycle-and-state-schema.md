# Run lifecycle and state schema

Each run has a lifecycle status and a canonical `state.json` under its run directory.
Implicit active-run resolution only considers active runs.
State and messaging command selectors resolve among active runs, while cleanup and merge planning can explicitly select completed, abandoned, and failed runs for post-run inspection.
`pi-herd run list --all` can inspect non-active runs.
A run can be marked `failed` when creation or orchestration fails after the run directory exists.
We chose this because pi-herd must support multiple parallel runs without guessing the target when commands omit `--run`.

Slice 2 implements the first schema version.
`pi-herd run create` writes `schema_version: 1`, a timestamp-plus-slug `run_id`, a human-friendly `run_slug`, the original goal, lifecycle timestamps, repository root, base ref, canonical run directory, a lead binding placeholder, and selected role records.
The initial selected roles default to `planner`, `implementer`, `reviewer`, and `tester`, or can be limited with repeated `--role` flags.
Role records start as `pending` with `worktree_path: null`, `worktree_status: pending`, and `worktree_provider: null` before optional worktree materialization.
Slice 3 updates selected role records to `worktree_status: materialized` with `worktree_path` and `worktree_provider` when `--with-worktrees` or `--planner-worktree` materializes them.
`herdr_workspace_id` is recorded only when Herdr-managed materialization succeeds; raw `git worktree add` fallback records `worktree_provider: git` and leaves `herdr_workspace_id: null`.
Raw git fallback is allowed only after Herdr creation exits nonzero or fails to spawn; Herdr timeouts and successful Herdr creation with unusable, missing, or mismatched metadata fail clearly instead of attempting fallback against the same target.
Slice 4 updates the lead binding with verified or newly launched lead pane/session refs, then updates launched role records with pane ids, session refs, and `launch_metadata` as each launch step succeeds.
When a Herdr-created worktree workspace id is replaced by the role session workspace id, the original value is preserved as `worktree_herdr_workspace_id`.
If materialization, launch, or kickoff fails, pi-herd persists the latest state, keeps any successful role materializations or launch refs, marks the run `failed`, and excludes it from active-run resolution.
Slice 5 sends prompts through role pane refs, marks the role `working`, updates `last_activity_at`, and persists state after message delivery.
H1 validates saved pane refs with Herdr before prompt delivery.
If Herdr clearly reports that a saved pane is missing, pi-herd relaunches the role before sending; ambiguous validation failures stop without clearing saved pane or session refs.
Freshly launched planner, reviewer, and tester prompts wait briefly for Herdr idle readiness, but readiness failures are warning-only and do not change persisted role state.
If Enter submission fails after text insertion, pi-herd reports that the pane may contain unsubmitted text so callers know a retry may duplicate it.
When first-send activation materializes reviewer or tester worktrees, pi-herd persists state after materialization, after launch, and after sending so partial activation remains recoverable.
Slice 5 lead status, brief, and collect helpers read state and artifact inventory without changing run completion state or writing `FINAL_SUMMARY.md`.
H2 adds shared run resolution for messaging and lead helpers, verified current-pane targeting before the single-active-run fallback, run discovery from role worktrees through git common-directory metadata, and `pi-herd run list [--all] [--json]`.
Run discovery and run creation now require a git repository or git worktree so the canonical repository root is unambiguous.
H2 also adds additive `state_revision` provenance and locked read-modify-write updates for messaging state changes.
Slice 6 uses the locked update path for `wait` and top-level `collect` role verdict persistence.
`status` stays read-only and does not bump `state_revision`.
`wait` and `collect` only persist `done`, `incomplete`, or `blocked` verdicts for roles that are still mutable and whose `last_activity_at` has not changed since the activity probe.
Top-level `collect` writes `logs/` pane captures and `FINAL_SUMMARY.md`, but it does not change the run lifecycle status to `completed` or `abandoned`.
Slice 7 refresh updates reviewer or tester worktree metadata through locked state updates after materializing, recreating, or refreshing the role worktree.
Refresh sets the role source ref to the implementation branch and preserves role pane/session refs without changing the run lifecycle.
Slice 8 `merge-plan` writes `MERGE_DECISION.md` without changing run state.
Slice 8 `cleanup` is report-only by default, can close worker panes, can remove role worktrees, and can mark a run `completed` or `abandoned` only when explicit flags are passed.
Cleanup refuses working panes or worktrees and dirty worktree removal unless forced, never closes the lead pane, never deletes branches, and applies lifecycle changes after pane or worktree cleanup succeeds.
Transient git worktree removal failures become non-fatal warnings so cleanup continues with the remaining role records and any lifecycle update, while dirty or unexpected-worktree errors remain fatal.
After cleanup marks a run completed or abandoned, the run is excluded from implicit active-run resolution but remains selectable explicitly by cleanup and merge planning commands.

Run state writes use atomic JSON replacement.
Read-modify-write commands lock, re-read, mutate only owned fields synchronously, increment `state_revision` when a write is needed, and then atomically replace the JSON file.
They must not await caller-provided work while the state lock is held.
A synchronous mutator may return `false` to skip the atomic write and revision bump when the fresh state no longer needs a change.
Creation and start-time single-writer paths still write atomically without the lock helper.
Configured `paths.runs_dir` values must be repository-relative, remain inside the repository root, and avoid symlink path components before state is written.
