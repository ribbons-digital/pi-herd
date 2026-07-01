# pi-herd Slice Plan

Status: Design approved, with Slice 0, Slice 1, and Slice 2 complete on the current branch.

Each remaining slice has one clear deliverable and should be implemented from its GitHub issue.
Each slice should be implemented on a branch and merged by pull request.

## Slice 0: Herdr and Pi capability discovery

Goal: Verify the real Herdr and Pi command shapes before product code depends on them.

Deliverable: A capability report and ADR documenting launch, send, read, wait, lead detection, and completion-signal contracts.

Result: Complete in [the capability report](capabilities/herdr-pi-capability-report.md) and [ADR 0008](adr/0008-herdr-pi-capability-contract.md).

Scope:

- Probe Herdr CLI commands for workspace, worktree, tab, pane, agent, wait, and integration operations.
- Probe Pi CLI launch flags for model, provider, thinking, session naming, and session resumption.
- Identify how to detect current Pi and Herdr context for lead binding.
- Identify how to read session activity for worker completion.
- Identify how to send prompts to worker panes reliably.
- Document fallback paths where Herdr agent-specific commands are not available.
- Produce ADR 0008 or update an equivalent ADR with the verified capability contract.

Out of scope:

- Building product CLI behavior beyond probes.
- Creating long-lived user configuration.

## Slice 1: CLI foundation, doctor, and init

Goal: Create a working TypeScript CLI foundation with validated config and environment checks.

Deliverable: `pi-herd doctor` and `pi-herd init` work locally using the verified capability contract.

Result: Complete in PR #13.

Scope:

- TypeScript project scaffold.
- pnpm scripts for build, test, lint, and format where applicable.
- CLI entrypoint.
- Config schema for harness profiles, roles, paths, and built-in context budget defaults.
- Minimal generated config without noisy per-role null maps.
- `pi-herd doctor` checks for `pi`, `herdr`, git repo, git worktree support, and valid config if present.
- `pi-herd init` creates `.pi-herd/config.yaml`, `.pi-herd/runs/`, `.gitignore` entries where appropriate, and prompt/config templates.
- Tests for config and doctor behavior where practical.
- README with project overview.
- `CONTEXT.md` and initial ADRs.

Out of scope:

- Worktree creation.
- Herdr pane creation.
- Worker launch.

## Slice 2: Run state and artifact model

Goal: Implement run creation without launching workers.

Deliverable: `pi-herd run create` creates run state and canonical artifacts.

Status: Implemented on the current branch.

Result: `pi-herd run create` creates the canonical run directory, `REQUEST.md`, `state.json`, `logs/`, `inbox/`, pending selected-role records, and active-run resolution helpers.

Scope:

- Run id and run slug generation.
- Slug collision handling.
- Run lifecycle statuses: active, completed, abandoned.
- Canonical run directory creation.
- `REQUEST.md` creation.
- `state.json` creation using the approved schema.
- Role records for selected roles.
- Lead inbox directory and file convention.
- Active-run resolution helpers.
- Multiple active run ambiguity handling.
- Atomic state writes.
- Token-aware output constants.

Implemented notes:

- `--role` can be repeated to select any subset of `planner`, `implementer`, `reviewer`, and `tester`.
- `--base-ref` overrides the detected current branch or commit.
- `--json` prints the saved state.
- Configured `paths.runs_dir` must be repository-relative, stay inside the repo root, and avoid symlink path components.

Out of scope:

- Creating git worktrees.
- Launching Herdr panes.

## Slice 3: Worktree orchestration

Goal: Create and track role worktrees safely.

Deliverable: `pi-herd run create --with-worktrees` or equivalent creates the implementation worktree and any eagerly materialized role worktrees.

Status: In progress.

Scope:

- Herdr worktree creation first.
- Git worktree fallback.
- Implementation branch creation.
- Implementer worktree creation.
- Planner worktree creation when configured.
- Reviewer and tester worktree records remain `worktree: pending` until activation or refresh.
- Dirty worktree checks.
- Clear worktree paths and branches in output.

Out of scope:

- Starting Pi sessions.
- Sending prompts.
- Refreshing reviewer and tester from implementation branch.

## Slice 4: Herdr pane and session launch

Goal: Create visible Herdr panes and launch harness sessions.

Deliverable: `pi-herd start` creates or binds lead, opens worker panes, launches Pi sessions, and activates only planner by default.

Scope:

- Herdr workspace/tab/pane helpers.
- Pi harness adapter.
- Lead binding from verified context source.
- Lead pane creation when no current lead is detectable.
- Worker panes and staged workers.
- Reviewer and tester can be staged with `worktree: pending`.
- Planner kickoff prompt.
- State persistence for pane/session refs.
- Harness adapter exposes enough launch metadata for later capability mismatch warnings.

Out of scope:

- Rich status board.
- Optional Pi extension.

## Slice 5: Messaging and lead commands

Goal: Let the lead steer workers safely.

Deliverable: `pi-herd send`, `pi-herd lead status`, `pi-herd lead send`, `pi-herd lead collect`, and `pi-herd lead brief` work with active-run resolution.

Scope:

- Message sending to role panes.
- Lead-only guardrails for orchestration commands.
- Worker-safe commands.
- Lead inbox helpers.
- Capability mismatch warnings using adapter metadata.
- Bounded `lead brief` output.
- Reviewer and tester activation can call the same refresh/materialization path used later by `pi-herd refresh`.

Out of scope:

- Full artifact collection.
- Merge planning.

## Slice 6: Status, wait, and collect

Goal: Make orchestration observable and artifact-first.

Deliverable: `pi-herd status`, `pi-herd wait`, and `pi-herd collect` distinguish `done` from `incomplete` and produce `FINAL_SUMMARY.md`.

Scope:

- Harness activity signal read helpers from the verified capability contract.
- Pane log collection.
- Artifact presence checks.
- Basic role artifact validation.
- Completion mapping where idle or stopped signal plus valid artifact becomes `done`.
- Completion mapping where idle or stopped signal plus missing or invalid artifact becomes `incomplete`.
- `FINAL_SUMMARY.md` with provenance.
- Token-aware terminal output.
- Status table and JSON output.

Out of scope:

- Merge execution.
- Advanced board UI.

## Slice 7: Refresh, diff, and review/test flow

Goal: Support repeated implementation passes and isolated reviewer/tester worktree views.

Deliverable: `pi-herd refresh reviewer/tester`, `pi-herd diff`, and role prompts support review and test passes against the implementation branch.

Scope:

- Materialize reviewer and tester worktrees from implementation branch when needed.
- Refresh reviewer and tester worktrees from implementation branch between passes.
- Refuse destructive refresh when reviewer or tester worktrees contain unexpected local changes unless forced.
- Show implementation diffs.
- Update role prompts for repeated passes.
- Detect unexpected source edits by artifact-only roles where practical.

Out of scope:

- Automatic merge.
- PR creation helper.

## Slice 8: Cleanup and merge planning

Goal: Safely close runs and prepare merge decisions without auto-merging.

Deliverable: `pi-herd cleanup` and `pi-herd merge-plan` work with dirty-worktree checks and `MERGE_DECISION.md`.

Scope:

- Close panes where safe.
- Remove worktrees only when requested.
- Refuse dirty removal unless forced.
- Never delete branches unless explicit.
- Generate merge decision artifact.
- Print reviewer verdict and tester status as context without enforcing a CI policy engine.
- Mark runs completed or abandoned when appropriate.

Out of scope:

- Actual automatic merge.

## Slice 9: Herdr plugin packaging

Goal: Expose common workflows through Herdr plugin actions.

Deliverable: Herdr plugin manifest and actions for doctor, start, status, collect, and cleanup.

Scope:

- `herdr-plugin.toml` using pnpm build commands.
- Plugin actions.
- Basic board pane if practical.
- Plugin documentation.

Out of scope:

- Pi extension.

## Slice 10: Optional Pi extension

Goal: Make lead-session UX smooth from inside Pi.

Deliverable: `/herd status`, `/herd send`, `/herd collect`, `/herd brief`, and optional safe tools.

Scope:

- Pi extension command wrapper.
- Lead-oriented slash commands.
- Tools disabled by default.
- No destructive agent-callable tools.
- Extension docs.

Out of scope:

- Owning orchestration state in the extension.
