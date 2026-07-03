# pi-herd

Visible Pi session orchestration with Herdr and git worktrees.

pi-herd is a Herdr-first orchestration layer for running multiple visible coding-agent sessions as isolated, steerable workers.
It is Pi-first, but the core model is harness-neutral so future harnesses can be supported.

## Status

Design approved.
Slice 0 capability discovery is complete.
Slice 1 CLI foundation is complete.
Slice 2 run state and artifact model is complete.
Slice 3 worktree orchestration is complete.
Slice 4 Herdr pane and session launch is complete.
Slice 5 messaging and lead commands are complete.
H1 Herdr client reliability hardening is complete.
H2 run-resolution and state-write safety hardening is complete.
Slice 6 status, wait, and collect is complete.
Slice 7 refresh, diff, and review/test flow is complete.
Slice 8 cleanup and merge planning is complete.
Slice 9 Herdr plugin packaging is implemented on the current branch.
Implementation continues as ordered GitHub issues and pull requests.

## Docs

- [Product spec](docs/spec.md)
- [Slice plan](docs/slices.md)
- [Approval plan](docs/approval-plan.md)
- [Capability report](docs/capabilities/herdr-pi-capability-report.md)
- [Domain language](CONTEXT.md)
- [ADRs](docs/adr/)

## CLI commands

```bash
pi-herd init
pi-herd doctor
pi-herd doctor --json
pi-herd run create "replace legacy auth refresh flow"
pi-herd run create "plan auth refresh" --role planner --base-ref main --json
pi-herd run create "implement auth refresh" --with-worktrees
pi-herd run list
pi-herd run list --all --json
pi-herd start "replace legacy auth refresh flow"
pi-herd send implementer "Implement the approved plan."
pi-herd send reviewer -- "--check the implementation branch"
pi-herd status
pi-herd status --json
pi-herd wait --timeout-ms 60000 --poll-interval-ms 2000
pi-herd collect
pi-herd refresh reviewer
pi-herd refresh tester --force
pi-herd diff
pi-herd merge-plan
pi-herd merge-plan --json --run latest
pi-herd cleanup --complete
pi-herd cleanup --abandon
pi-herd cleanup --remove-worktrees --force
pi-herd lead status
pi-herd lead send tester "Run the approved smoke test."
pi-herd lead collect
pi-herd lead brief
```

`pi-herd init` creates `.pi-herd/config.yaml`, `.pi-herd/runs/`, role prompt templates under `.pi-herd/prompts/`, and safe ignore entries.
It does not overwrite existing config or prompts unless `--force` is passed.

`pi-herd doctor` checks git, git worktree support, Pi, Herdr, Herdr server reachability, Herdr Pi integration status, and the local config when present.
Warnings do not make the command fail, but hard failures such as invalid config or missing git repo do.

`pi-herd run create` creates a canonical run directory with `REQUEST.md`, `state.json`, `logs/`, and `inbox/`.
By default it creates pending role records for `planner`, `implementer`, `reviewer`, and `tester`.
It must run inside a git repository and fails if base ref inference cannot resolve a branch or commit.
`pi-herd start` uses the same git repository and base-ref requirements because it creates a run before launching sessions.
Pass `--role` one or more times to limit the selected roles, `--base-ref` to override the detected branch or commit, `--json` for the saved state, or `--config` for a custom config path.
Configured `paths.runs_dir` values must be repository-relative, remain inside the repository root, and not traverse symlinks.
Pass `--with-worktrees` to materialize the implementation worktree while leaving reviewer and tester worktrees pending.
Worktree creation requires a clean repository outside the configured runs directory and `.worktrees`, refuses existing target paths or branches, uses Herdr first, and falls back to `git worktree add` only when Herdr creation exits nonzero or Herdr cannot be spawned.
If Herdr creation times out or exits successfully but returns missing, unusable, or mismatched metadata, pi-herd fails clearly instead of attempting git fallback against the same target.
Pass `--planner-worktree` to also materialize a planner worktree; it implies `--with-worktrees`.
Created worktrees use `.worktrees/pi-herd/{run_id}/{role}` and are listed in text output with their branch and provider.
If worktree materialization fails after the run directory is created, the saved run state is marked `failed` and is not selected as active.
It does not create panes or worker sessions.

`pi-herd run list` lists active runs by default.
It must run inside the repository or one of its git worktrees.
Use `--all` to include completed, failed, and abandoned runs, or `--json` for machine-readable output.
Run discovery works from the main checkout and from role worktrees when git can identify the shared common directory.

`pi-herd start` creates the run artifacts, checks that the repository is clean outside ignored pi-herd paths before materializing worktrees, materializes the implementer worktree when selected, binds the current Pi/Herdr pane as lead when verified, or creates a lead workspace and session when needed.
It accepts repeated `--role` flags, `--base-ref`, `--planner-worktree`, `--json`, and `--config`.
It launches and activates the planner with an initial kickoff prompt after a bounded Herdr idle wait.
If readiness cannot be confirmed, it prints a warning and sends the kickoff anyway.
It launches the implementer as a staged session in the implementation worktree when the implementer role is selected.
Reviewer and tester remain staged slots with pending worktrees until first activation.
Launch metadata and pane/session refs are persisted after each successful step so partial launch failures leave recoverable state.

`pi-herd send` sends a prompt to a selected role pane using Herdr pane text submission.
`--run` and `--config` may appear before or after message text while option parsing is active; use `--` before dash-prefixed message text so it is treated literally.
When `--run` is omitted, send and lead helpers first try a verified current Herdr/Pi pane binding and otherwise use the single active run fallback.
They must run inside the repository or one of its git worktrees so pi-herd can locate the canonical run state.
Before sending to an existing pane, pi-herd validates the saved pane id with Herdr.
If Herdr clearly reports that the pane is missing, pi-herd relaunches the role session safely before sending; ambiguous validation failures stop without clearing saved pane state.
When reviewer or tester is selected but not launched yet, the first send materializes that role worktree from the implementation branch, launches the session, waits briefly for idle readiness, then sends the prompt.
If readiness cannot be confirmed, it prints a warning and sends anyway.
Sending marks the role `working` and records `last_activity_at` through a locked state update, but does not infer completion.
Prompt text, including multi-line text, is delivered as one `pane send-text` payload followed by Enter.
If Enter submission fails after text insertion, pi-herd reports that the pane may contain unsubmitted text and a retry may duplicate it.
`pi-herd lead send` performs the same send with a lead-pane guard.
`pi-herd status` evaluates role activity and required artifacts without writing run state.
`pi-herd wait` polls working or blocked roles until they resolve to `done`, `incomplete`, or `blocked`, then persists role verdicts through locked state updates.
If a stored blocked role reports working again, `wait` keeps polling rather than treating the stale blocked state as resolved.
Use `--timeout-ms`, `--poll-interval-ms`, and `--json` to tune wait behavior and output.
`wait` and `collect` return exit code 0 when all evaluated roles are cleanly done, 2 when wait times out, and 3 when any role is incomplete, blocked, failed, or still working.
`pi-herd collect` evaluates roles, persists role verdicts, collects bounded pane logs under `logs/`, and writes `FINAL_SUMMARY.md` with provenance and artifact excerpts.
It never marks the run itself completed or abandoned.
`pi-herd refresh reviewer` and `pi-herd refresh tester` materialize or refresh artifact-only role worktrees from the implementation branch between passes.
Refresh refuses dirty role worktrees, committed role-branch changes, or a working role unless `--force` is passed; forced refresh saves a backup ref, stashes dirty work when needed, resets to the implementation branch, and cleans untracked files.
`pi-herd diff` prints a bounded `base_ref...implementation_branch` stat and changed-file summary.
`pi-herd merge-plan` writes `MERGE_DECISION.md` with provenance, bounded implementation diff context, role verdict context, reviewer and tester excerpts, warnings, and manual merge next steps.
It never merges, pushes, or changes run state.
Use `--json` for machine-readable output.
`pi-herd cleanup` is report-only by default.
Pass `--complete` or `--abandon` to close the run lifecycle, `--close-panes` to close worker panes, and `--remove-worktrees` to remove role worktrees.
`--complete` and `--abandon` are mutually exclusive.
Cleanup never closes the lead pane and never deletes branches.
Closing worker panes or removing worktrees refuses working roles unless `--force` is passed; dirty worktree removal is also refused unless forced, and forced worktree removal saves recovery refs and dirty-work stashes where needed.
Use `--json` for machine-readable cleanup output.
Explicit `--run` selectors for merge planning and cleanup can inspect completed, abandoned, or failed runs after they leave active-run resolution.
Repeated-pass artifacts must be fresh relative to the role's latest activity timestamp, so stale `REVIEW.md` or `TEST_REPORT.md` files do not count as complete.
Generated reviewer and tester prompt templates describe this refresh flow, but `pi-herd init` does not overwrite existing prompt files unless `--force` is passed.
`pi-herd lead status`, `pi-herd lead brief`, and `pi-herd lead collect` are bounded, state-based lead helpers.
`lead collect` prints a read-only artifact and inbox inventory.
They do not infer worker completion or write `FINAL_SUMMARY.md`; use top-level `pi-herd collect` for final collection.

## Herdr plugin development

The repository includes a Herdr plugin manifest at `herdr-plugin.toml`.
The plugin id is `ribbons-digital.pi-herd`.
It exposes actions for `doctor`, `start`, `status`, `collect`, and report-only `cleanup`.

Build locally before linking:

```bash
sfw pnpm build
herdr plugin link .
herdr plugin action list --plugin ribbons-digital.pi-herd
```

Invoke actions with either the qualified action id or the local action id plus `--plugin`:

```bash
herdr plugin action invoke ribbons-digital.pi-herd.doctor
herdr plugin action invoke status --plugin ribbons-digital.pi-herd
```

Herdr 0.7.1 action invocation does not pass arbitrary action arguments.
The plugin `start` action therefore prints usage instead of guessing a goal from context.
Run `pi-herd start <goal>` directly from the project checkout when starting a run.

The `collect` action is non-source-destructive, but it writes run state, logs, and `FINAL_SUMMARY.md` just like `pi-herd collect`.
The `cleanup` action passes no destructive flags, so it only reports what cleanup would do.

GitHub plugin installation runs the manifest build commands with bare `pnpm`.
Local validation in this environment uses `sfw pnpm ...`.

## Local development

```bash
sfw pnpm install
sfw pnpm build
sfw pnpm test
sfw pnpm lint
sfw pnpm dev -- doctor
```

Use `pnpm` for package management.
Do not use `npm`.
After initial repository setup, work proceeds one issue per branch and one pull request per issue.
