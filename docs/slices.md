# pi-herd Slice Plan

Status: Design approved, with Slice 0 through Slice 9 plus H1 and H2 implemented on the current branch.

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

Status: Complete.

Result: `pi-herd run create` creates the canonical run directory, `REQUEST.md`, `state.json`, `logs/`, `inbox/`, pending selected-role records, and active-run resolution helpers.

Scope:

- Run id and run slug generation.
- Slug collision handling.
- Run lifecycle statuses: active, completed, abandoned, failed.
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

Status: Implemented on the current branch.

Scope:

- Herdr worktree creation first.
- Git worktree fallback.
- Implementation branch creation.
- Implementer worktree creation.
- Planner worktree creation when configured.
- Reviewer and tester worktree records remain `worktree: pending` until activation or refresh.
- Dirty worktree checks.
- Clear worktree paths and branches in output.

Implemented notes:

- `--with-worktrees` creates the implementer worktree when the implementer role is selected.
- `--planner-worktree` implies `--with-worktrees` and creates the planner worktree when the planner role is selected.
- Worktrees are created under `.worktrees/pi-herd/{run_id}/{role}`.
- Herdr metadata must match the requested path and branch before it is trusted.
- Raw `git worktree add` is used only when Herdr worktree creation exits nonzero or Herdr cannot be spawned.
- Herdr timeouts and successful Herdr creation with unusable, missing, or mismatched metadata fail clearly instead of attempting git fallback against the same target.
- Existing target paths, existing branches, symlink path components, and dirty repositories are refused before provider creation.
- If a later worktree fails after an earlier one succeeds, persisted state keeps the successful role materialized and marks the run `failed`.

Out of scope:

- Starting Pi sessions.
- Sending prompts.
- Refreshing reviewer and tester from implementation branch.

## Slice 4: Herdr pane and session launch

Goal: Create visible Herdr panes and launch harness sessions.

Deliverable: `pi-herd start` creates or binds lead, opens planner and implementer panes when selected, launches Pi sessions for those roles, and activates only planner by default.

Status: Implemented on the current branch.

Scope:

- Herdr workspace/tab/pane helpers.
- Pi harness adapter.
- Lead binding from verified context source.
- Lead pane creation when no current lead is detectable.
- Planner and implementer panes, plus staged reviewer and tester slots.
- Reviewer and tester can be staged with `worktree: pending`.
- Planner kickoff prompt.
- State persistence for pane/session refs.
- Harness adapter exposes enough launch metadata for later capability mismatch warnings.

Implemented notes:

- `pi-herd start <goal>` reuses run creation and implementer worktree materialization, including clean repository checks before worktree creation.
- The current Pi/Herdr pane is bound as lead only after Herdr pane verification.
- When no current lead can be verified, pi-herd creates a lead workspace/session.
- Planner is launched and activated with a kickoff prompt submitted through pane send-text plus Enter.
- Implementer is launched as a staged session in the materialized implementation worktree.
- Reviewer and tester remain staged role slots with pending worktrees and no launched sessions.
- Launch refs and additive launch metadata are persisted after each successful launch so partial failures remain recoverable.

Out of scope:

- Rich status board.
- Optional Pi extension.

## Slice 5: Messaging and lead commands

Goal: Let the lead steer workers safely.

Deliverable: `pi-herd send`, `pi-herd lead status`, `pi-herd lead send`, `pi-herd lead collect`, and `pi-herd lead brief` work with active-run resolution.

Status: Implemented on the current branch.

Scope:

- Message sending to role panes.
- Lead-only guardrails for orchestration commands.
- Worker-safe commands.
- Lead inbox helpers.
- Capability mismatch warnings using adapter metadata.
- Bounded `lead brief` output.
- Reviewer and tester activation can call the same refresh/materialization path used later by `pi-herd refresh`.

Implemented notes:

- `pi-herd send` resolves active runs, sends prompts through pane send-text plus Enter, and marks the role working without inferring completion.
- Send parsing allows `--run` and `--config` before or after message text and preserves dash-prefixed literal message text after `--`.
- If Enter submission fails after text insertion, pi-herd reports the partial-send state because retrying may duplicate the unsubmitted prompt.
- `pi-herd lead send` reuses send behavior with a verified lead-pane guard.
- Reviewer and tester first activation materializes a role worktree from the implementation branch, launches the session, persists state after each step, and then sends the prompt.
- Active-run resolution can use a verified current Herdr/Pi pane binding before falling back to single-active-run resolution.
- `lead status`, `lead brief`, and `lead collect` are bounded state and artifact inventory helpers, not completion or final summary commands.

Out of scope:

- Full artifact collection.
- Merge planning.

## H1: Herdr client and prompt-delivery reliability

Goal: Harden Herdr command integration before status and collection build on it.

Status: Implemented on the current branch.

Scope:

- Shared Herdr command wrappers and metadata parsing.
- Readiness wait before first prompt delivery after fresh launch.
- Warning-only fallback when readiness cannot be confirmed.
- Stale worker pane validation and safe relaunch before send.
- Multi-line prompt behavior pinned as one `send-text` payload plus Enter.

Out of scope:

- Completion semantics.
- Status or wait commands.
- Run-resolution and state-lock hardening.

TODO:

- Live-probe Herdr multi-line `pane send-text` behavior before changing the current single-payload approach.

## H2: Run resolution, git guard, provenance, and state-write safety

Goal: Harden run discovery and state writes before status and collection add more writers.

Status: Implemented on the current branch.

Scope:

- Fail run creation outside a git repository.
- Require run listing and implicit run resolution to start inside the repository or one of its git worktrees.
- Fail base-ref inference when neither branch nor commit resolves.
- Resolve runs through one shared resolver across messaging and lead helpers.
- Prefer explicit `--run`, then verified current Herdr/Pi pane binding, then single active run.
- Include run choices in ambiguity errors.
- Discover canonical run state from role worktrees by using `git rev-parse --git-common-dir`, with the legacy `.worktrees/pi-herd` path parser as fallback.
- Add `state_revision` as an additive provenance field.
- Add locked `updateRunState` for synchronous read-modify-write state updates and migrate messaging writes to it.
- Fix run directory allocation so only `EEXIST` is treated as a slug collision.
- Add `pi-herd run list [--all] [--json]`.

Implemented notes:

- Creation and start-time single-writer paths still use direct atomic writes.
- Slice 6 `wait` and `collect` state writers use `updateRunState` with synchronous mutators only.
- If the current pane cannot be bound to an active run but exactly one active run exists, commands keep the single-active-run fallback behavior.

Out of scope:

- Completion semantics.
- Status or wait commands.
- Reviewer and tester clean-repo policy.

## Slice 6: Status, wait, and collect

Goal: Make orchestration observable and artifact-first.

Deliverable: `pi-herd status`, `pi-herd wait`, and `pi-herd collect` distinguish `done` from `incomplete` and produce `FINAL_SUMMARY.md`.

Status: Implemented on the current branch.

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

Implemented notes:

- `pi-herd status` is read-only and reports stored status, evaluated status, activity signal, artifact validity, warnings, and JSON output.
- `pi-herd wait` polls working or blocked roles, excludes pending and staged roles, and persists resolved role verdicts through locked `updateRunState` synchronous mutators only.
- Status persistence is guarded so stale observations do not overwrite roles whose `last_activity_at` changed after probing.
- Activity mapping treats a clear missing pane as `stopped`, treats `blocked` as `blocked`, keeps polling a stored blocked role that reports working again, and never maps `unknown` to `done` even when artifacts are present.
- Required artifacts are valid only when present and non-empty after trimming; Slice 7 adds repeated-pass freshness checks.
- `pi-herd collect` persists role verdicts, collects bounded pane logs under `logs/`, and writes `FINAL_SUMMARY.md` with run provenance and bounded artifact excerpts.
- Top-level `collect` does not mark the run `completed` or `abandoned`; lifecycle closure remains later cleanup work.
- `pi-herd lead collect` remains a read-only inventory helper and does not write `FINAL_SUMMARY.md`.

Out of scope:

- Merge execution.
- Advanced board UI.

## Slice 7: Refresh, diff, and review/test flow

Goal: Support repeated implementation passes and isolated reviewer/tester worktree views.

Deliverable: `pi-herd refresh reviewer/tester`, `pi-herd diff`, and role prompts support review and test passes against the implementation branch.

Status: Implemented on the current branch.

Scope:

- Materialize reviewer and tester worktrees from implementation branch when needed.
- Refresh reviewer and tester worktrees from implementation branch between passes.
- Refuse destructive refresh when reviewer or tester worktrees contain unexpected local changes unless forced.
- Refuse refresh while reviewer or tester is working unless forced.
- Show implementation diffs with a bounded merge-base diff range.
- Update role prompts for repeated passes.
- Detect unexpected source edits by artifact-only roles where practical.
- Require repeated-pass artifacts to be fresh relative to role activity timestamps.

Implemented notes:

- `pi-herd refresh <reviewer|tester>` materializes pending role worktrees or refreshes existing worktrees from the implementation branch.
- Dirty worktrees are refused with bounded dirty-path output unless `--force` is passed.
- Forced refresh saves a backup ref, stashes dirty work when needed, resets to the implementation branch, and cleans untracked files.
- `pi-herd diff` prints bounded `git diff --stat` and `git diff --name-status` output for `base_ref...implementation_branch`.
- `status`, `wait`, and `collect` treat stale required artifacts as invalid for active passes and warn when artifact-only role worktrees are dirty.
- Generated reviewer and tester prompt templates explain repeated-pass refresh expectations.
- Existing prompt files are not overwritten by `init` unless `--force` is passed.

Out of scope:

- Automatic merge.
- PR creation helper.

## Slice 8: Cleanup and merge planning

Goal: Safely close runs and prepare merge decisions without auto-merging.

Deliverable: `pi-herd cleanup` and `pi-herd merge-plan` work with dirty-worktree checks and `MERGE_DECISION.md`.

Status: Implemented on the current branch.

Scope:

- Close panes where safe.
- Remove worktrees only when requested.
- Refuse dirty removal unless forced.
- Never delete branches unless explicit.
- Generate merge decision artifact.
- Print reviewer verdict and tester status as context without enforcing a CI policy engine.
- Mark runs completed or abandoned when appropriate.

Implemented notes:

- `pi-herd merge-plan` writes `MERGE_DECISION.md` with provenance, bounded diff context, role verdict context, reviewer and tester excerpts, warnings, and manual next steps.
- `merge-plan` is read-only for run state and never merges, pushes, or changes lifecycle status.
- `pi-herd cleanup` is report-only by default and mutates only when explicit action flags are passed.
- `cleanup --close-panes` closes worker panes but never closes the lead pane.
- `cleanup --remove-worktrees` removes role worktrees through Herdr workspace removal when provider metadata is available, with git worktree removal as fallback.
- Missing stored role worktree paths are reported and cleared from run state.
- Worktree removal refuses dirty or working roles unless forced, and forced removal saves recovery refs and dirty-work stashes where needed.
- Transient git worktree removal failures become non-fatal warnings while dirty or unexpected-worktree errors remain fatal, so cleanup continues with the remaining role records and any lifecycle update.
- Cleanup never deletes role branches.
- `--complete` and `--abandon` are mutually exclusive.
- `merge-plan` and `cleanup` support JSON output and explicit selection of non-active runs.
- Lifecycle changes happen last with `--complete` or `--abandon`, so earlier cleanup failures leave the run retryable.

Out of scope:

- Actual automatic merge.
- Branch deletion.

## Slice 9: Herdr plugin packaging

Goal: Expose common workflows through Herdr plugin actions.

Deliverable: Herdr plugin manifest and actions for doctor, start, status, collect, and cleanup.

Status: Implemented on the current branch.

Scope:

- `herdr-plugin.toml` using pnpm build commands.
- Plugin actions.
- Plugin contract verification.
- Plugin documentation.

Implemented notes:

- The root `herdr-plugin.toml` declares plugin id `ribbons-digital.pi-herd`.
- The manifest build commands use bare `pnpm install --frozen-lockfile` and `pnpm build` for Herdr plugin installation.
- The manifest declares exactly five actions: `doctor`, `start`, `status`, `collect`, and `cleanup`.
- The action wrapper resolves the target project cwd from Herdr plugin context or Herdr pane metadata before invoking the CLI.
- The action wrapper fails closed when no target project cwd can be resolved.
- Herdr 0.7.1 plugin action invocation does not pass arbitrary action arguments, so the `start` action prints usage unless explicit goal text is passed to the wrapper directly.
- Plugin invocation does not provide `PI_CODING_AGENT=true` in the verified probe, so plugin actions do not assume Pi lead binding survives invocation.
- The `cleanup` action is report-only and rejects destructive cleanup flags.
- The `collect` action is documented as state and artifact writing.
- The plugin contract verification is recorded in the capability report.

Out of scope:

- Pi extension.
- Basic board pane.
- Destructive cleanup actions.

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
