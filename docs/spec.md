# pi-herd Product Spec

Status: Reviewed draft with Slice 5 messaging, lead commands, H1 Herdr client reliability hardening, H2 run-resolution and state-write safety hardening, Slice 6 status/wait/collect, Slice 7 refresh/diff flow, Slice 8 cleanup/merge planning, and Slice 9 Herdr plugin packaging implemented on the current branch.

pi-herd is visible session orchestration for coding-agent work in Herdr.
It is Pi-first, but the core model is harness-neutral so future harnesses such as Hermes or Cursor can be added without rewriting the product language.

## Product thesis

Subagents are not the goal.
The goal is multiple isolated, visible, steerable coding-agent sessions with clean handoff and worktree-safe coordination.

pi-herd gives users the useful parts of subagents without hiding workers inside one parent process.
A run uses a lead session plus visible worker sessions in Herdr panes.
Each worker has a focused role and usually an isolated git worktree.
Workers communicate through explicit messages and durable artifacts, not hidden coordination.

## Product identity

The GitHub repository is `ribbons-digital/pi-herd`.
The local CLI command is `pi-herd`.
The Herdr plugin id is `ribbons-digital.pi-herd`.
The future npm package should use a Ribbons Digital scope if published.
The unscoped package name `pi-herd` should not be used for publishing because adjacent packages already exist.

## Primary form

The primary product is a TypeScript CLI plus Herdr plugin.
The optional Pi extension is a convenience layer for lead-session commands.
The optional Pi extension must not own orchestration state or become the runtime.

## Core model

### Harness

A harness is the coding-agent runtime launched inside Herdr panes.
Pi is the only production target for the first shipped version.
The config and state model should remain harness-neutral where practical.

### Session

A session is a visible harness process in a Herdr pane.
The lead session is the user-facing orchestration session.
Worker sessions are role-based sessions for planning, implementation, review, testing, or research.

### Run

A run is one complete orchestration container for one user goal or implementation slice.
A run can include retries, multiple implementation passes, multiple review passes, and multiple test passes.
A run is not a single worker pass.

pi-herd must support multiple parallel runs.
Commands must avoid ambiguous defaults when more than one run is active.

### Run identity

`run_id` is the unique canonical key for a run.
It should be sortable and collision-resistant, such as a timestamp plus slug or ULID plus slug.
The canonical run directory uses `run_id`:

```text
.pi-herd/runs/{run_id}
```

`run_slug` is a human-friendly selector derived from the goal.
Slugs are conveniences, not canonical identity, and may repeat across runs created at different timestamps.
If a slug selector matches multiple active runs, pi-herd requires the user to select by `run_id`.

### Run lifecycle

A run has a lifecycle status:

- `active`: the run can be selected by implicit active-run resolution.
- `completed`: the run is finished and should not be implicitly selected.
- `abandoned`: the run was stopped or cleaned up without completion and should not be implicitly selected.
- `failed`: creation or orchestration failed and should not be implicitly selected.

Implicit active-run resolution only considers active runs.
Explicit `--run` selectors for most state and messaging commands resolve among active runs.
Cleanup and merge planning commands may explicitly select completed, abandoned, and failed runs for post-run inspection or cleanup.
`pi-herd run list --all` can inspect completed, abandoned, and failed runs.
`--run latest` is allowed only as an explicit selector.
pi-herd must never silently choose the newest run when multiple active runs exist.

### Lead session

Every run has exactly one lead session.
The lead session owns coordination and final decisions.
It is a normal visible harness session, not a hidden controller.

If `pi-herd start` is invoked from a detectable Pi session with Herdr context, that current session should become the lead.
If it is invoked from shell or outside detectable context, pi-herd should create a lead pane/session.

Slice 0 verified the lead-detection contract.
A command running with `HERDR_ENV=1`, `HERDR_PANE_ID`, and `PI_CODING_AGENT=true` is a Pi lead candidate, and pi-herd should verify the pane with Herdr before binding it as the lead.

### Worker sessions

Workers do focused work and write durable artifacts.
Workers do not coordinate directly with other workers by default.
Worker requests go through artifacts or the lead inbox.
The lead decides whether to forward, ignore, or act on those requests.

## State file

Each run stores state at:

```text
.pi-herd/runs/{run_id}/state.json
```

The state schema should start with this shape:

```json
{
  "schema_version": 1,
  "run_id": "2026-07-01T12-00-00-auth-refresh",
  "run_slug": "auth-refresh",
  "goal": "replace legacy auth refresh flow",
  "status": "active",
  "created_at": "2026-07-01T12:00:00.000Z",
  "updated_at": "2026-07-01T12:00:00.000Z",
  "repo_root": "/Users/shiang/projects/example",
  "base_ref": "main",
  "canonical_run_dir": "/Users/shiang/projects/example/.pi-herd/runs/2026-07-01T12-00-00-auth-refresh",
  "lead_binding": {
    "role": "lead",
    "harness": "pi",
    "herdr_workspace_id": null,
    "herdr_tab_id": null,
    "herdr_pane_id": null,
    "session_ref": null
  },
  "roles": {
    "planner": {
      "role": "planner",
      "status": "pending",
      "harness": "pi",
      "branch": "pi-herd/2026-07-01T12-00-00-auth-refresh/planner",
      "worktree_path": null,
      "worktree_status": "pending",
      "worktree_provider": null,
      "herdr_workspace_id": null,
      "herdr_tab_id": null,
      "herdr_pane_id": null,
      "session_ref": null,
      "required_artifacts": ["PLAN.md"],
      "last_activity_at": null
    },
    "reviewer": {
      "role": "reviewer",
      "status": "pending",
      "harness": "pi",
      "branch": "pi-herd/2026-07-01T12-00-00-auth-refresh/reviewer",
      "source_ref": "pi-herd/2026-07-01T12-00-00-auth-refresh/impl",
      "worktree_path": null,
      "worktree_status": "pending",
      "worktree_provider": null,
      "herdr_workspace_id": null,
      "herdr_tab_id": null,
      "herdr_pane_id": null,
      "session_ref": null,
      "required_artifacts": ["REVIEW.md"],
      "last_activity_at": null
    }
  }
}
```

Role records may also include `worktree_herdr_workspace_id` after Herdr worktree materialization, preserving the worktree workspace when `herdr_workspace_id` is later updated to the launched session workspace.
Role `launch_metadata` records the harness command, args, cwd, provider, model, thinking preference, expected writes, launch method, and prompt method when available.
State may include additive `state_revision` provenance after locked read-modify-write updates.
Creation and start-time single-writer paths use atomic JSON replacement.
Commands that mutate existing run state should use locked read-modify-write updates so concurrent writers do not lose each other's fields.
Locked update mutators must be synchronous and must not await caller-provided work while the state lock is held.
Concurrent runs write separate state files.
`pi-herd run create` creates `REQUEST.md`, `state.json`, `logs/`, and `inbox/`, with pending role records only for the selected roles.
`pi-herd run create --with-worktrees` also materializes the implementer worktree and records its path, branch, worktree provider, worktree status, and Herdr workspace id when available in `state.json`.
`--planner-worktree` implies `--with-worktrees` and also materializes the planner worktree.
If worktree materialization fails after state creation, pi-herd persists any successful materializations, marks the run `failed`, and excludes it from active-run resolution.
`pi-herd start` reuses run creation, binds or launches the lead, launches planner and implementer sessions when those roles are selected, waits briefly for planner idle readiness before the kickoff prompt, submits the planner kickoff prompt, and records pane ids, session refs, launch metadata, and prompt metadata as each step succeeds.
When planner readiness cannot be confirmed, pi-herd records a warning and sends the kickoff anyway.
When a Herdr-created worktree workspace id is later replaced by the session workspace id, pi-herd preserves the worktree workspace id in `worktree_herdr_workspace_id`.
If launch or kickoff fails after state creation, pi-herd persists any successful launch refs, marks the run `failed`, and excludes it from active-run resolution.
`pi-herd send` validates saved pane ids before prompt delivery, sends prompts through pane send-text plus Enter, marks the targeted role `working`, and records `last_activity_at` through a locked state update without inferring completion.
Send commands accept `--run` and `--config` before or after message text while option parsing is active, and `--` marks the rest of the arguments as literal message text for dash-prefixed prompts.
Prompt text, including multi-line text, is delivered as one `pane send-text` payload followed by Enter.
If Enter submission fails after text insertion, pi-herd reports that the pane may contain unsubmitted text and a retry may duplicate it.
When Herdr clearly reports that a saved role pane is missing, pi-herd relaunches the role session before sending; ambiguous pane validation failures stop without clearing saved state.
The first send to a reviewer or tester can materialize that role worktree from the implementation branch, launch the role session, wait briefly for idle readiness, persist state after each successful step, and then send the prompt.
When readiness cannot be confirmed after first-send activation, pi-herd records a warning and sends anyway.
`pi-herd lead status`, `pi-herd lead brief`, and `pi-herd lead collect` read state and artifact inventory without changing completion state or writing `FINAL_SUMMARY.md`.
`pi-herd status` evaluates role activity and required artifacts without writing state.
`pi-herd wait` polls working or blocked roles until they resolve to `done`, `incomplete`, or `blocked`, then persists role verdicts through locked `updateRunState` synchronous mutators only.
If a stored blocked role reports working again, `wait` keeps polling rather than treating the stale blocked state as resolved.
`pi-herd collect` evaluates roles, persists role verdicts, collects bounded pane logs under `logs/`, and writes `FINAL_SUMMARY.md` with provenance and artifact excerpts.
Top-level `collect` does not mark the run `completed` or `abandoned`; run lifecycle closure remains cleanup scope.
`pi-herd refresh reviewer` and `pi-herd refresh tester` materialize or refresh artifact-only role worktrees from the implementation branch between passes.
Refresh refuses dirty role worktrees, committed role-branch changes, or a working role unless `--force` is passed.
Forced refresh saves a backup ref, stashes dirty work when needed, resets the role worktree to the implementation branch, and cleans untracked files.
`pi-herd diff` prints bounded stat and changed-file output for the `base_ref...implementation_branch` merge-base range.
The current implementation supports selecting `planner`, `implementer`, `reviewer`, and `tester`; `researcher` remains a future role.

## Run resolution

Commands accept explicit run selection:

```bash
pi-herd run list [--all] [--json]
pi-herd lead status --run <run_id|slug|latest>
pi-herd send reviewer "Review current diff." --run <run_id|slug|latest>
pi-herd send reviewer -- "--audit the implementation branch"
pi-herd lead collect --run <run_id|slug|latest>
pi-herd refresh reviewer --run <run_id|slug|latest>
pi-herd diff --run <run_id|slug|latest>
pi-herd merge-plan --run <run_id|slug|latest>
pi-herd cleanup --run <run_id|slug|latest>
```

For cleanup and merge planning, explicit `--run` selectors may resolve completed, abandoned, and failed runs as well as active runs.
When `--run` is omitted, resolution order is:

1. Use a verified current Herdr/Pi pane binding when available.
2. Use the only active run if exactly one active run exists.
3. Otherwise fail and ask the user to pass `--run`.

If a verified current pane is not bound to an active run but exactly one active run exists, commands keep the single-active-run fallback.
Run discovery must start inside the repository or one of its git worktrees.
It works from the main checkout and from role worktrees by using git's common directory when available, with the `.worktrees/pi-herd` path shape as a fallback.
Ambiguity errors include run choices.
`latest` is available only when the user explicitly passes it.

## Role model

Built-in roles are:

- `lead`
- `planner`
- `implementer`
- `reviewer`
- `tester`
- `researcher`

The first shipped version should wire `planner`, `implementer`, `reviewer`, and `tester` through the main flow.
`researcher` can remain a defined future role until a slice explicitly enables it.

Each role has:

- role id
- display name
- purpose
- default prompt template
- expected writes
- required artifacts
- default worktree strategy
- optional model preference
- optional thinking preference

The lead is a role for coordination and binding purposes.
It has no required artifact and no role worktree by default.

Expected writes are deliberately lightweight:

- `none`
- `artifacts`
- `worktree`

pi-herd uses expected writes to warn about capability mismatches.
It does not require users to maintain a heavy permission policy configuration.

## Harness profiles and models

The harness remains the source of truth for model availability.
pi-herd stores per-role preferences and passes them to the harness adapter.
It should not maintain a static global model catalog.

Default config should stay small:

```yaml
schema_version: 1
harness:
  default: pi
  profiles:
    pi:
      command: pi
paths:
  runs_dir: .pi-herd/runs
  prompts_dir: .pi-herd/prompts
```

`paths.runs_dir` must be repository-relative, remain inside the repository root, and avoid symlink path components.

Per-role overrides are supported but should not clutter the default generated config:

```yaml
harness:
  profiles:
    pi:
      models:
        reviewer: claude-opus-4-8
      thinking:
        reviewer: high
```

Future CLI overrides should support role-specific model settings:

```bash
pi-herd start "goal" --model reviewer=claude-opus-4-8 --model tester=claude-haiku-4
```

For Pi, the adapter uses `pi --model`, `pi --provider`, and `pi --thinking` when configured in the harness profile.
Future `doctor` and `start --dry-run` checks should warn when a configured preference cannot be mapped confidently.

## Capability checks

pi-herd should keep permissions simple and visible.
It should not ship a complex policy engine as the default user experience.

If a role appears to need capabilities that the configured harness launch may not provide, pi-herd should explain the mismatch and let the user decide whether to restart or continue.

Examples:

- A reviewer needs to write `REVIEW.md` but appears to have no write capability.
- An implementer needs source edit capability in an isolated worktree but appears to be launched read-only.

Safety comes from:

- separate worktrees by default
- clear role prompts
- artifact expectations
- capability warnings
- post-run diff checks for unexpected source edits
- no automatic merge
- safe cleanup rules

## Worktree model

Every non-lead worker should use an isolated source view by default when it needs to inspect, edit, or test implementation state.
Multiple workers must not operate in the same source worktree by default.

Default worktree root:

```text
.worktrees/pi-herd/{run_id}/{role}
```

Default implementation branch:

```text
pi-herd/{run_id}/impl
```

The implementer owns the implementation branch and implementation worktree.
`pi-herd run create --with-worktrees` creates the implementer worktree and implementation branch when the implementer role is selected.
`--planner-worktree` also creates the planner worktree and branch when the planner role is selected.
Reviewer and tester role worktree views should be materialized lazily when those roles are activated or refreshed.
Reviewer and tester worktrees are created from the implementation branch on first activation or refresh.
`pi-herd refresh reviewer` and `pi-herd refresh tester` also recreate missing stored worktrees when the role branch still exists, or rematerialize a pending role worktree when needed.
Refresh refuses unexpected paths, non-role branches, other repositories, dirty paths, committed role-branch changes, and working roles unless forced.
Forced refresh saves a backup ref, stashes dirty work when needed, resets to the implementation branch, and cleans untracked files.
Reviewer and tester branches are not default merge targets.

Preferred worktree creation uses Herdr worktree commands.
Raw `git worktree add` commands are the fallback only when Herdr worktree creation exits nonzero or Herdr cannot be spawned.
If Herdr times out or exits successfully but omits required metadata or returns JSON that does not match the requested absolute path and branch, pi-herd fails clearly instead of attempting git fallback against the same target.
Worktree materialization requires a clean repository outside ignored run and worktree paths, refuses existing target paths, refuses existing branches, and rejects symlink components in the worktree path.

## Canonical run directory

All artifacts live in one canonical run directory under the main checkout:

```text
.pi-herd/runs/{run_id}
```

Worker source operations happen in role worktrees.
Worker artifacts are written to the canonical run directory.
This avoids divergent per-worktree artifact copies.

The run directory contains:

```text
REQUEST.md
PLAN.md
IMPLEMENTATION_NOTES.md
REVIEW.md
TEST_REPORT.md
FINAL_SUMMARY.md
MERGE_DECISION.md
state.json
logs/
inbox/
```

`.pi-herd/` and `.worktrees/` should be ignored by git in user projects unless a user explicitly chooses otherwise.
Project templates and package files in the pi-herd repository itself are still tracked normally.

## Lead inbox

The lead inbox is a durable place for worker requests.
Workers should write requests instead of directly orchestrating other workers.

Inbox files live under:

```text
.pi-herd/runs/{run_id}/inbox/
```

Recommended file name:

```text
{timestamp}-{from_role}-{kind}.md
```

Required fields:

```markdown
# Worker Request

From: reviewer
Kind: question | request | blocker
Created: 2026-07-01T12:10:00+10:00

## Body

...
```

The lead owns decisions about inbox items.

## Worker completion

Harness idle or stopped state is an input signal, not an orchestration status.
A worker is complete only when the session is no longer actively working and the required artifact is present, non-empty, and fresh relative to the worker's latest activity.
Role-specific artifact validation can still be added over time.

Statuses:

- `pending`: session or role slot is not started
- `staged`: pane or role slot exists, but no task prompt has been activated
- `working`: session is active
- `done`: harness activity has stopped and required artifact is complete
- `incomplete`: harness activity has stopped but required artifact is missing or invalid
- `blocked`: worker explicitly reports it is blocked
- `failed`: orchestration or process error

Slice 0 verified that Herdr agent status, pane process state, Pi integration metadata, and wait events are activity signals, not completion by themselves.
Herdr `done` was listed in wait help but not observed in the live probe, so pi-herd must continue to require stopped or idle-like activity plus required artifact validation before marking a worker `done`.
A missing pane is a stopped signal only when Herdr clearly reports that the saved pane does not exist.
A `blocked` activity signal maps to role status `blocked`.
An `unknown` activity signal never maps to `done`, even when required artifacts are present.
Required artifacts are valid only when present, non-empty after trimming whitespace, and fresh relative to the role's latest activity timestamp.
Stale artifacts are reported separately and do not satisfy worker completion for repeated passes.
Reviewer and tester materialized worktrees are checked for dirty paths during status evaluation, and dirty artifact-only worktrees produce warnings.

## Staged activation

`pi-herd start` creates the run, lead binding, selected worker slots, and the implementation worktree if implementation is selected.
Only the planner is activated by default.
Planner kickoff waits briefly for Herdr to report the pane idle, but readiness failure is warning-only so a slow integration does not block the run.
The implementer session is launched as staged in the implementation worktree when the implementer role is selected.
Reviewer and tester remain staged slots without launched sessions, and their worktrees may remain `worktree: pending` until first activation or refresh.
The first send to reviewer or tester is an activation: pi-herd materializes the role worktree from the implementation branch, launches the role session, waits briefly for idle readiness, persists state, and submits the prompt.

Future options may allow eager activation, but staged activation is the default.

## Lead commands

The lead namespace provides shortcuts for the lead session:

```bash
pi-herd lead status
pi-herd lead send reviewer "Review current diff."
pi-herd lead collect
pi-herd lead brief
```

`lead status` prints current run and role state from `state.json`.
`lead send` requires the command to run from the verified bound Pi lead pane, then sends the role prompt with the same parsing and delivery semantics as `send`.
`lead collect` prints a read-only artifact and inbox inventory.
`lead brief` prints a bounded orchestration brief suitable for pasting into or reading from the lead session.
These lead helpers do not infer worker completion or write `FINAL_SUMMARY.md`; use top-level `pi-herd collect` for final collection.

## Core CLI commands

Production command set:

```bash
pi-herd doctor
pi-herd init
pi-herd run create
pi-herd run list
pi-herd start <goal>
pi-herd add-role <role>
pi-herd send <role> <message>
pi-herd lead status
pi-herd lead send <role> <message>
pi-herd lead collect
pi-herd lead brief
pi-herd wait
pi-herd status
pi-herd collect
pi-herd focus <role>
pi-herd diff
pi-herd refresh <reviewer|tester>
pi-herd merge-plan
pi-herd cleanup
```

`run create` supports early state and worktree creation without panes or worker sessions.
It must run inside a git repository and fails if base ref inference cannot resolve a branch or commit.
`start` uses the same git repository and base-ref requirements because it creates a run before launching sessions.
`run create` accepts repeated `--role` flags for selected roles, `--base-ref` for the recorded source ref, `--with-worktrees` for implementer worktree materialization, `--planner-worktree` for eager planner worktree materialization that implies `--with-worktrees`, `--json` for machine-readable state output, and `--config` for a custom config file.
`run list` lists active runs by default and accepts `--all`, `--json`, and `--config`.
It must run inside the repository or one of its git worktrees.
`start` is the user-facing launch command.
It accepts repeated `--role` flags for selected roles, `--base-ref`, `--planner-worktree`, `--json`, and `--config`.
When selected roles require worktrees, it applies the same clean-repository and materialization rules as `run create --with-worktrees`.
`send` is implemented for selected roles and can activate reviewer or tester on first send.
It validates saved pane ids before delivery, relaunches only when Herdr clearly reports a missing pane, and treats readiness waits after fresh launch as warning-only.
`lead status`, `lead send`, `lead collect`, and `lead brief` are implemented as bounded lead helpers.
`status`, `wait`, and top-level `collect` are implemented for Slice 6 observability and artifact-first completion.
`refresh reviewer`, `refresh tester`, and `diff` are implemented for Slice 7 repeated review and test passes.
`refresh` accepts `--force`, `--run`, and `--config`.
`diff` accepts `--run` and `--config`.
`wait` and `collect` return 0 when all evaluated roles are cleanly done, 2 when wait times out, and 3 when any role is incomplete, blocked, failed, or still working.
`merge-plan` prepares safe merge instructions.
It writes `MERGE_DECISION.md` with provenance, bounded diff context, role verdict context, reviewer and tester excerpts, warnings, and manual next steps.
It does not merge automatically and does not write run state.
It accepts `--json`, `--run`, and `--config`.
`cleanup` is report-only by default.
It can close worker panes with `--close-panes`, remove role worktrees with `--remove-worktrees`, and mark runs completed or abandoned with `--complete` or `--abandon`.
`--complete` and `--abandon` are mutually exclusive.
Cleanup accepts `--json`, `--run`, and `--config`.
Cleanup never closes the lead pane and never deletes branches.
Worktree removal is provider-aware, using Herdr workspace removal when Herdr metadata is available and git worktree removal otherwise.
If a stored role worktree path is already missing, cleanup reports the stale path and clears that worktree state.
Dirty or working roles are refused for destructive cleanup unless `--force` is passed; forced cleanup saves recovery refs and dirty-work stashes where needed.
Transient git worktree removal failures become non-fatal warnings so cleanup continues with the remaining role records and any lifecycle update, while dirty or unexpected-worktree errors remain fatal.
Lifecycle changes happen last so fatal cleanup failures leave the run retryable.

## collect and brief

`lead collect` currently reads current run state, lists expected worker artifacts from the canonical run directory, and lists up to 20 inbox entries.
It is read-only and does not save logs, validate completion, or generate `FINAL_SUMMARY.md`.

Top-level `collect` now:

1. Reads current run state.
2. Reads worker artifacts from the canonical run directory.
3. Saves recent pane output logs under `logs/` where Herdr can provide them.
4. Validates expected artifact presence, non-empty content, and freshness relative to role activity.
5. Persists role verdicts through locked state updates.
6. Generates `FINAL_SUMMARY.md`.
7. Prints a concise summary and the generated path.

`FINAL_SUMMARY.md` includes provenance.
It is generated from worker artifacts and does not replace them.

`lead brief` should be shorter than `FINAL_SUMMARY.md` and optimized for the lead session.

## Token-aware output controls

Full artifacts and logs are stored on disk.
Terminal output and lead brief output should be bounded by default to avoid polluting the lead context window.

Built-in defaults:

- brief token budget: about 2000 tokens
- log tail: about 120 lines per role
- artifact preview: about 4000 characters per artifact

Generated config should not include these knobs unless the user asks for advanced configuration.
Optional override surface:

```yaml
context:
  brief_token_budget: 2000
  log_tail_lines: 120
  artifact_preview_chars: 4000
```

Commands should list full artifact paths and provide `--full` where appropriate.

## Optional Pi extension

The Pi extension is a convenience layer for the lead session.
It can provide:

```text
/herd status
/herd start
/herd send reviewer <message>
/herd collect
/herd brief
/herd focus reviewer
/herd diff
```

Agent-callable tools should be disabled by default.
Destructive commands such as cleanup, merge, and worktree removal should not be exposed as agent-callable tools in the first shipped extension.

## Herdr plugin

The Herdr plugin exposes common actions:

- doctor
- start
- status
- collect
- cleanup

The plugin id is `ribbons-digital.pi-herd`.
The plugin manifest and build commands use pnpm, not npm.
The plugin action wrapper resolves the target project cwd from Herdr plugin context or Herdr pane metadata before invoking repository-targeting CLI commands.
The wrapper fails closed when no target cwd can be resolved.
The `cleanup` action is report-only and does not pass destructive cleanup flags.
The `collect` action may write run state, logs, and `FINAL_SUMMARY.md`.
Herdr 0.7.1 action invocation does not pass arbitrary action arguments, so the `start` action prints usage unless explicit goal text is supplied to the wrapper directly.
Herdr records plugin action stdout and stderr in plugin logs.
The plugin does not own orchestration state.

## Development workflow

The project is developed in ordered slices.
Each slice becomes a GitHub issue after the reviewed plan is approved.
Each issue is implemented on its own branch and merged through a PR.
No direct pushes to main after initial setup.
The user merges PRs.
After merge, main is synced and the next issue starts only after user approval.

Continuity is tracked in Memory Lane.
The project should not maintain `HANDOFF.md`.
