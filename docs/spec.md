# pi-herd Product Spec

Status: Reviewed draft for user approval.

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
Slugs are conveniences, not canonical identity.
If two active or historical runs would share a slug, pi-herd should apply a deterministic suffix or require the user to select by `run_id`.

### Run lifecycle

A run has a lifecycle status:

- `active`: the run can be selected by implicit active-run resolution.
- `completed`: the run is finished and should not be implicitly selected.
- `abandoned`: the run was stopped or cleaned up without completion and should not be implicitly selected.

Active-run resolution only considers active runs unless the user explicitly selects another run.
`--run latest` is allowed only as an explicit selector.
pi-herd must never silently choose the newest run when multiple active runs exist.

### Lead session

Every run has exactly one lead session.
The lead session owns coordination and final decisions.
It is a normal visible harness session, not a hidden controller.

If `pi-herd start` is invoked from a detectable Pi session with Herdr context, that current session should become the lead.
If it is invoked from shell or outside detectable context, pi-herd should create a lead pane/session.

The exact lead-detection source of truth must be verified in Slice 0.
Candidate sources include environment variables, Herdr pane metadata, Pi session metadata, or Herdr integration state.

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
  "created_at": "2026-07-01T12:00:00+10:00",
  "updated_at": "2026-07-01T12:05:00+10:00",
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
      "status": "working",
      "harness": "pi",
      "branch": "pi-herd/auth-refresh/plan",
      "worktree_path": "/Users/shiang/projects/example/.worktrees/pi-herd/auth-refresh/planner",
      "worktree_status": "materialized",
      "herdr_workspace_id": null,
      "herdr_tab_id": null,
      "herdr_pane_id": null,
      "session_ref": null,
      "required_artifacts": ["PLAN.md"],
      "last_activity_at": null
    },
    "reviewer": {
      "role": "reviewer",
      "status": "staged",
      "harness": "pi",
      "source_ref": "pi-herd/auth-refresh/impl",
      "worktree_path": null,
      "worktree_status": "pending",
      "required_artifacts": ["REVIEW.md"]
    }
  }
}
```

State writes should be atomic.
Concurrent runs write separate state files.

## Run resolution

Commands accept explicit run selection:

```bash
pi-herd status --run <run_id|slug|latest>
pi-herd send --run <run_id|slug> reviewer "Review current diff."
pi-herd collect --run <run_id|slug>
```

When `--run` is omitted, resolution order is:

1. Use a run id from an explicit lead or pane binding.
2. Use a run id from harness or Herdr context when available.
3. Use the only active run if exactly one active run exists.
4. Otherwise fail with a clear list of active runs and ask the user to pass `--run`.

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
harness:
  default: pi
  profiles:
    pi:
      command: pi
      provider: null
      model: null
      thinking: null
```

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

CLI overrides should support role-specific model settings:

```bash
pi-herd start "goal" --model reviewer=claude-opus-4-8 --model tester=claude-haiku-4
```

For Pi, the adapter can use `pi --model`, `pi --provider`, and `pi --thinking` when configured.
`doctor` and `start --dry-run` should warn when a configured preference cannot be mapped confidently.

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
.worktrees/pi-herd/{run_slug}/{role}
```

Default implementation branch:

```text
pi-herd/{run_slug}/impl
```

The implementer owns the implementation branch and implementation worktree.
The implementer worktree and implementation branch should be created eagerly when the implementation role is selected.
Reviewer and tester role worktree views should be materialized lazily when those roles are activated or refreshed.
Reviewer and tester worktrees are refreshed from the implementation branch.
Reviewer and tester branches are not default merge targets.

Preferred worktree creation uses Herdr worktree commands.
Raw git worktree commands are the fallback.

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
A worker is complete only when the session is no longer actively working and the required artifact exists.
Role-specific artifact validation should be added over time.

Statuses:

- `pending`: session or role slot is not started
- `staged`: pane or role slot exists, but no task prompt has been activated
- `working`: session is active
- `done`: harness activity has stopped and required artifact is complete
- `incomplete`: harness activity has stopped but required artifact is missing or invalid
- `blocked`: worker explicitly reports it is blocked
- `failed`: orchestration or process error

The exact harness activity source of truth must be verified in Slice 0.
Candidate sources include Herdr agent status, pane process status, Pi integration status, or recent output wait conditions.

## Staged activation

`pi-herd start` should create the run, lead binding, selected worker slots, and the implementation worktree if implementation is selected.
Only the planner should be activated by default.
Implementer, reviewer, and tester should be staged until the lead explicitly sends them work.
Reviewer and tester worktrees may remain `worktree: pending` until first activation or refresh.

Future options may allow eager activation, but staged activation is the default.

## Lead commands

The lead namespace provides shortcuts for the lead session:

```bash
pi-herd lead status
pi-herd lead send reviewer "Review current diff."
pi-herd lead collect
pi-herd lead brief
```

`lead brief` should print a bounded orchestration brief suitable for pasting into or reading from the lead session.

## Core CLI commands

Production command set:

```bash
pi-herd doctor
pi-herd init
pi-herd run create
pi-herd start <goal>
pi-herd add-role <role>
pi-herd send <role> <message>
pi-herd wait
pi-herd status
pi-herd collect
pi-herd focus <role>
pi-herd diff
pi-herd refresh <role>
pi-herd merge-plan
pi-herd cleanup
```

`run create` supports early state creation before launch behavior is implemented.
`start` is the user-facing command once orchestration launch exists.
`merge-plan` prepares safe merge instructions.
It does not merge automatically.

## collect and brief

`collect` should:

1. Read current run state.
2. Read worker artifacts from the canonical run directory.
3. Save recent pane output logs under `logs/`.
4. Validate expected artifact presence.
5. Detect unexpected source edits by artifact-only roles where practical.
6. Generate `FINAL_SUMMARY.md`.
7. Print a concise next action.

`FINAL_SUMMARY.md` should include provenance.
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
/herd diff implementer
```

Agent-callable tools should be disabled by default.
Destructive commands such as cleanup, merge, and worktree removal should not be exposed as agent-callable tools in the first shipped extension.

## Herdr plugin

The Herdr plugin should expose common actions:

- doctor
- start
- status
- collect
- cleanup

The plugin manifest and build commands must use pnpm, not npm.

## Development workflow

The project is developed in ordered slices.
Each slice becomes a GitHub issue after the reviewed plan is approved.
Each issue is implemented on its own branch and merged through a PR.
No direct pushes to main after initial setup.
The user merges PRs.
After merge, main is synced and the next issue starts only after user approval.

Continuity is tracked in Memory Lane.
The project should not maintain `HANDOFF.md`.
