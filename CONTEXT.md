# pi-herd

pi-herd is a visible session orchestration product for coordinating normal Pi workers through Herdr panes and git worktrees.
This language guide keeps product terms precise while the design is finalized.

## Language

**pi-herd**:
The product name and local CLI identity for visible Pi session orchestration with Herdr and git worktrees.
Use `pi-herd` for the GitHub repo name, CLI command, and product name.
_Avoid_: unscoped npm package name `pi-herd`

**Package identity**:
The future npm package identity for pi-herd, reserved for a scoped Ribbons Digital package if publishing becomes necessary.
_Avoid_: publishing as unscoped `pi-herd`

**Herdr plugin id**:
The plugin identifier used by Herdr for this product.
Use `ribbons-digital.pi-herd`.
_Avoid_: `fireplace.pi-herd`

**Herdr plugin action**:
A Herdr-discovered action from `herdr-plugin.toml` that wraps safe pi-herd CLI entry points from a focused project pane or workspace.
Repository-targeting actions resolve the project directory from Herdr plugin context or pane metadata and fail closed when no target can be found.
The first plugin actions are `doctor`, `start`, `status`, `collect`, and report-only `cleanup`.
The Herdr-discovered `start` action prints usage because Herdr 0.7.1 does not pass goal text.
_Avoid_: assuming plugin invocation has Pi lead binding or arbitrary action arguments

**Herdr plugin pane**:
A Herdr-managed terminal pane declared by `herdr-plugin.toml` for read-first pi-herd visibility.
The first pane is `run-board`, which runs `pi-herd board` through the plugin pane wrapper, resolves the target project from Herdr plugin context or pane metadata, and stays open with a small refresh prompt because Herdr closes plugin panes when their command exits.
The board is read-only: it delegates to `pi-herd status` semantics, shows the run, lead, roles, artifacts, warnings, durable paths, and suggested terminal commands, and does not own orchestration state.
_Avoid_: treating the board as a native/web UI, adding destructive controls, writing board artifacts, or making it the source of truth

**Pi extension command**:
Pi slash commands registered by the optional pi-herd extension for lead-session convenience.
The first command is `/herd`, with `init`, `doctor`, `start`, `status`, `brief`, `collect`, `diff`, `wait`, `send`, and `help` subcommands that map to existing CLI commands or local usage text.
The extension also registers `/herd-start <goal>` as a prompt-native alias for `/herd start <goal>`.
`/herd init`, `/herd doctor`, `/herd start`, `/herd-start`, `/herd diff`, and `/herd wait` map to top-level `pi-herd` commands, while `/herd status`, `/herd brief`, `/herd collect`, and `/herd send` map to the existing `pi-herd lead` command family.
`/herd start` and `/herd-start` accept a simple goal, reject leading flag-like goals, use a longer timeout, show partial-run recovery guidance on timeout, and rely on the CLI to guard against starting a duplicate active run from a pane that is already bound as lead.
`/herd-start` exists because Pi prompt templates expand after extension slash-command dispatch and do not re-dispatch expanded `/herd ...` text as commands.
`/herd doctor` presents checks-failed reports as warnings when the CLI returns diagnostics on stdout, preserving any stderr warning text with the report.
`/herd collect` stays read-only.
`/herd diff` stays read-only and shows diff stat plus changed files against the run base ref.
`/herd wait` waits up to 60 seconds, polls every 2 seconds, records role verdicts in run state like terminal `pi-herd wait`, and presents timeout or unresolved-verdict snapshots as warnings rather than hard failures.
`/herd wait` does not accept custom timeout flags; use terminal `pi-herd wait` for longer or custom waits.
`/herd send` parses `--run` only as a trailing selector, preserves dash-prefixed message text without a `--` sentinel, and strips one matching outer quote pair from the message when present.
Child output is bounded before display, and an absolute `HERDR_BIN_PATH` contributes its directory to the child CLI `PATH`.
It does not own orchestration state and does not register agent-callable tools.
_Avoid_: treating the extension as the runtime, implementing duplicate-run state checks inside the extension, exposing destructive cleanup and merge actions through it, or assuming prompt-template expansion can invoke extension commands

**Harness**:
The coding-agent runtime that pi-herd launches inside visible Herdr panes.
Pi is the only MVP harness, but the domain model should allow future harnesses such as Hermes or Cursor.
_Avoid_: treating Pi as the permanent domain boundary

**Lead session**:
The user-facing orchestration session that coordinates a pi-herd run and owns final decisions.
In the MVP this is a Pi session, but the term is harness-neutral.
_Avoid_: hidden controller, delegator subagent

**Worker session**:
A visible role-based session launched by pi-herd to perform focused work such as planning, implementation, review, or testing.
In the MVP these are Pi sessions, but the term is harness-neutral.
_Avoid_: hidden subagent

**Run**:
One complete orchestration container for one user goal or implementation slice.
A run can include retries and multiple worker passes, and pi-herd should support multiple runs existing at the same time.
_Avoid_: using run to mean a single worker pass

**Development slice**:
A unit of work for building pi-herd itself, tracked as a GitHub issue and implemented via a pull request.
This is part of the project development process, not a feature pi-herd needs to provide to end users.
_Avoid_: treating GitHub issues as part of pi-herd's product model

**Active run**:
The run a command targets when `--run` is omitted.
Resolution should prefer explicit flags, then a verified lead or role pane binding, then a single active run, and should fail with choices when multiple active runs are ambiguous.
_Avoid_: silently defaulting to the newest run when multiple runs are active

**Run lifecycle**:
The state of a run as active, completed, abandoned, or failed.
Implicit active-run resolution only considers active runs.
Use `pi-herd run list --all` from the repository or one of its git worktrees to inspect old completed, abandoned, or failed runs.
_Avoid_: treating old completed, abandoned, or failed runs as candidates for implicit command targeting

**Worker completion**:
The condition where a worker session is considered done for orchestration purposes.
A worker is complete only when the harness activity signal says work has stopped and the required artifact is present, non-empty, and fresh relative to the worker's latest activity.
`pi-herd status` evaluates this without writing state, while `pi-herd wait` and top-level `pi-herd collect` persist resolved role verdicts.
_Avoid_: treating idle terminal state or a stale artifact alone as done

**Incomplete worker**:
A worker session where the harness activity signal says work has stopped but a required artifact is missing, empty, or stale for the current pass.
This status tells the lead to inspect or re-prompt the worker instead of collecting it as done.
_Avoid_: calling this done

**Blocked worker**:
A worker session whose activity signal says it is blocked or whose persisted role status remains blocked until it reports progress or is re-prompted.
`pi-herd wait` keeps polling a stored blocked role that reports working again rather than collecting the stale blocked state as final.
_Avoid_: treating a stale blocked status as completion

**Final summary**:
The generated run-level summary at `FINAL_SUMMARY.md` in the canonical run directory.
Top-level `pi-herd collect` writes this file from role verdicts, artifacts, pane-log collection results, and provenance, but `pi-herd lead collect` remains a read-only inventory helper.
_Avoid_: expecting `lead collect` to close a run or write the final summary

**Merge decision**:
The generated merge-preparation artifact at `MERGE_DECISION.md` in the canonical run directory.
`pi-herd merge-plan` writes this file with provenance, diff context, role verdict context, reviewer and tester excerpts, warnings, and manual next steps, but it never merges, pushes, or changes run state.
_Avoid_: treating merge planning as merge execution

**Cleanup action**:
An explicit run lifecycle or resource cleanup operation requested with `pi-herd cleanup` flags.
By default cleanup is report-only; it closes worker panes, removes role worktrees, or marks the run completed or abandoned only when requested.
Cleanup never closes the lead pane and never deletes branches.
_Avoid_: assuming cleanup is destructive unless an explicit action flag is passed

**Staged worker**:
A worker session slot whose pane may exist but whose task prompt has not been activated yet.
Reviewer and tester worktrees may be materialized lazily when the role is activated or refreshed, so staged status can show `worktree: pending` without being broken.
_Avoid_: starting implementer, reviewer, and tester before the lead explicitly sends them work

**Harness profile**:
A configuration section that describes how pi-herd launches a specific harness and passes role-specific options such as model, provider, thinking level, and tool policy.
The harness remains responsible for knowing which models are available.
_Avoid_: hardcoding a global pi-herd model catalog

**Role model selection**:
The per-role preference for which model or model pattern the harness should use when launching that role's session.
This is a launch preference resolved by the harness, not a pi-herd-owned list of available models.
_Avoid_: validating model availability from a static pi-herd list

**Expected writes**:
A lightweight declaration of what a role normally needs to write: nothing, artifacts, or its assigned worktree.
pi-herd uses this to warn about harness capability mismatches, not to create a heavy permission policy engine.
_Avoid_: complex write-policy configuration as the default user experience

**Capability mismatch**:
A situation where a role appears to need capabilities that the configured harness launch may not provide.
pi-herd should explain the mismatch and let the user decide whether to restart or continue.
_Avoid_: silently launching a worker that cannot perform its role

**Canonical run directory**:
The single shared artifact directory for a run, located under the main repository checkout at `.pi-herd/runs/{run_id}`.
Workers use their role worktrees for source operations but write artifacts to this shared run directory.
_Avoid_: treating per-worktree artifact copies as canonical

**Lead binding**:
The association between a run and the user-facing lead session or pane that owns coordination for that run.
When a run starts from an existing detectable Pi session, that session should become the lead; otherwise pi-herd should create a lead session.
_Avoid_: creating duplicate lead sessions when the user is already inside the intended lead

**Lead inbox**:
A durable place where workers can leave requests or questions for the lead session instead of directly orchestrating other workers.
The lead decides whether to forward, ignore, or act on these requests.
_Avoid_: worker-to-worker hidden coordination

**Worker request**:
A request from a worker to the lead for clarification, follow-up work, or another role's help.
Worker requests should be captured in artifacts or the lead inbox, not sent directly to another worker by default.
_Avoid_: worker-initiated orchestration commands as the normal workflow

**Prompt delivery**:
The Herdr pane submission path pi-herd uses to steer a worker.
Prompts are inserted with one `pane send-text` payload, including multi-line content, and then submitted with Enter.
After a fresh launch, pi-herd waits briefly for idle readiness and warns rather than blocks when readiness cannot be confirmed.
_Avoid_: assuming prompt delivery proves worker completion

**Implementation branch**:
The role-owned branch where source changes for a run are made and reviewed.
By default this is the only branch intended to become mergeable.
_Avoid_: treating reviewer or tester branches as merge targets

**Role worktree view**:
An isolated worktree assigned to a role for inspecting, editing, or testing the run's source state.
`pi-herd run create --with-worktrees` materializes the implementer worktree and can also materialize the planner worktree with `--planner-worktree`.
`pi-herd start` materializes the implementer worktree when the implementer role is selected, and it can also materialize the planner worktree with `--planner-worktree`.
Reviewer and tester worktrees should be materialized or refreshed from the implementation branch rather than sharing the implementer's worktree.
The first send to reviewer or tester can activate that role by creating the role worktree, launching the session, waiting briefly for readiness, and sending the prompt.
`pi-herd refresh reviewer` and `pi-herd refresh tester` refresh artifact-only role worktrees between passes and refuse dirty, committed, or working-role refreshes unless forced with backup protection.
_Avoid_: multiple workers operating in the same source worktree by default

## Example dialogue

Developer: Should the repo and CLI both be called pi-herd?
Domain expert: Yes.
The repo is `ribbons-digital/pi-herd`, the CLI is `pi-herd`, and the Herdr plugin id is `ribbons-digital.pi-herd`.
Developer: What does the Herdr plugin expose first?
Domain expert: It exposes `doctor`, `start`, `status`, `collect`, and report-only `cleanup` actions.
Repository-targeting actions resolve the target project from Herdr plugin context or pane metadata, and they fail closed rather than guessing when no project directory is available.
Because Herdr 0.7.1 plugin invocation does not pass arbitrary action arguments, the Herdr-discovered `start` action prints usage instead of inventing a goal.
Developer: Should we publish it as unscoped `pi-herd`?
Domain expert: No.
That risks confusion with existing packages, so future publishing should use a Ribbons Digital scope.
Developer: Is pi-herd only for Pi forever?
Domain expert: No.
Pi is the only MVP harness, but the core model should use harness-neutral lead and worker sessions so future harnesses can fit without a rewrite.
Developer: Does a run mean one worker pass?
Domain expert: No.
A run is the full container for one goal, including retries and multiple worker passes.
Developer: Are GitHub issues part of the product?
Domain expert: No.
GitHub issues are how we will manage the development slices for building pi-herd, not a feature of pi-herd itself.
Developer: What happens if multiple runs are active and I omit `--run`?
Domain expert: pi-herd should first check whether the current verified lead or role pane is bound to an active run.
If not, it should fail with a clear list rather than guessing the newest run.
Developer: Is a worker done when Herdr says the session is idle?
Domain expert: Not by itself.
The required artifact must exist too, otherwise the worker is incomplete.
Developer: Should all workers begin working as soon as a run starts?
Domain expert: No.
The selected worker slots can be created up front, but only the planner should be activated by default.
Reviewer and tester worktrees can be created lazily when those roles are activated.
Developer: Does pi-herd own the model catalog?
Domain expert: No.
pi-herd stores per-role model preferences, but the harness decides whether a model is available and how to launch it.
Developer: Should pi-herd enforce a heavy write policy for every role?
Domain expert: No.
It should keep expected writes simple, warn about capability mismatches, use worktree isolation, and report unexpected source changes after the fact.
Developer: Where does the real REVIEW.md live if the reviewer has its own worktree?
Domain expert: In the canonical run directory under the main checkout, not inside the reviewer worktree.
Developer: Should `pi-herd start` always create a new lead pane?
Domain expert: No.
If the command is invoked from a detectable Pi session, that session should become the lead; otherwise pi-herd should create one.
Developer: Can a reviewer directly tell the tester what to do?
Domain expert: Not by default.
The reviewer should leave a worker request for the lead, and the lead decides whether to send work to the tester.
Developer: Should reviewer and tester use the implementer's worktree?
Domain expert: No.
They should get isolated role worktree views refreshed from the implementation branch.
Developer: What does Slice 3 create when I pass `--with-worktrees`?
Domain expert: It creates the implementer worktree, optionally creates the planner worktree with `--planner-worktree`, and keeps reviewer and tester worktrees pending.
Developer: What does `pi-herd start` launch now?
Domain expert: It binds the current verified Pi/Herdr pane as lead or creates a lead workspace and session, launches the planner with a kickoff prompt, launches the implementer as staged when selected, and leaves reviewer and tester as staged slots without sessions.
Developer: What does first send to reviewer or tester do now?
Domain expert: It materializes that role worktree from the implementation branch, launches the role session, waits briefly for readiness, persists state, submits the prompt, and marks the role working without deciding whether it is done.
Developer: What if a saved worker pane has disappeared?
Domain expert: pi-herd validates the pane before sending and relaunches only when Herdr clearly reports the pane is missing.
Ambiguous validation errors stop without clearing saved state.
Developer: What do the top-level status, wait, and collect commands do now?
Domain expert: `pi-herd status` evaluates roles without writing state, `pi-herd wait` polls working or blocked roles and persists resolved role verdicts, and `pi-herd collect` persists verdicts, saves bounded pane logs, and writes `FINAL_SUMMARY.md` without closing the run lifecycle.
Developer: How do repeated reviewer and tester passes get fresh source?
Domain expert: The lead can run `pi-herd refresh reviewer` or `pi-herd refresh tester` to refresh the artifact-only role worktree from the implementation branch, while stale artifacts stop old `REVIEW.md` or `TEST_REPORT.md` files from counting as completion.
Developer: What does `pi-herd merge-plan` do?
Domain expert: It writes `MERGE_DECISION.md` with the implementation diff range, role verdict context, artifact excerpts, warnings, and manual merge next steps.
It does not merge or change run state.
Developer: Is `pi-herd cleanup` destructive by default?
Domain expert: No.
Without explicit flags it only reports cleanup candidates.
It needs `--close-panes`, `--remove-worktrees`, `--complete`, or `--abandon` to mutate anything, and it never closes the lead pane or deletes branches.
Developer: What does the optional Pi extension expose first?
Domain expert: It registers `/herd` for lead-session shortcuts: `init`, `doctor`, `start`, `status`, `brief`, read-only `collect`, read-only `diff`, bounded `wait`, `send`, and `help`.
It also registers `/herd-start <goal>` as a prompt-native alias for `/herd start <goal>` because Pi prompt templates do not re-dispatch expanded slash commands.
`/herd wait` uses a fixed 60-second timeout and 2-second poll interval, rejects custom wait flags, and records role verdicts in run state like terminal `pi-herd wait`, while `/herd diff` only reports stat and changed files.
It maps operational subcommands to existing CLI helpers, keeps orchestration state in CLI-owned run artifacts, and does not expose agent-callable tools or destructive cleanup and merge operations.
Developer: How should I start a run from Pi inside Herdr?
Domain expert: Use `/herd start <goal>` or `/herd-start <goal>` for a simple goal.
If you need advanced flags, use terminal `pi-herd start ...` instead.
If either command times out, inspect `pi-herd run list` or `pi-herd status` before retrying because startup may have partially completed.
Developer: How should I send a prompt that starts with a dash?
Domain expert: For terminal `pi-herd send`, put `--` after the role, then write the dash-prefixed prompt as literal message text.
For `/herd send`, write dash-prefixed text directly because only a final `--run RUN` is treated as a selector.
Quote the `/herd send` message when literal text should end with run-looking content, because one matching outer quote pair is stripped before delivery.
