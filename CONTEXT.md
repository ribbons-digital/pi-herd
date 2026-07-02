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
Resolution should prefer explicit flags, then a lead or pane binding, then a single active run, and should fail with choices when multiple active runs are ambiguous.
_Avoid_: silently defaulting to the newest run when multiple runs are active

**Run lifecycle**:
The state of a run as active, completed, abandoned, or failed.
Active-run resolution only considers active runs unless the user explicitly selects another run.
_Avoid_: treating old completed, abandoned, or failed runs as candidates for implicit command targeting

**Worker completion**:
The condition where a worker session is considered done for orchestration purposes.
A worker is complete only when the harness activity signal says work has stopped and the required artifact exists, with role-specific validation added over time.
_Avoid_: treating idle terminal state alone as done

**Incomplete worker**:
A worker session where the harness activity signal says work has stopped but a required artifact is missing or invalid.
This status tells the lead to inspect or re-prompt the worker instead of collecting it as done.
_Avoid_: calling this done

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

**Implementation branch**:
The role-owned branch where source changes for a run are made and reviewed.
By default this is the only branch intended to become mergeable.
_Avoid_: treating reviewer or tester branches as merge targets

**Role worktree view**:
An isolated worktree assigned to a role for inspecting, editing, or testing the run's source state.
`pi-herd run create --with-worktrees` materializes the implementer worktree and can also materialize the planner worktree with `--planner-worktree`.
`pi-herd start` materializes the implementer worktree when the implementer role is selected, and it can also materialize the planner worktree with `--planner-worktree`.
Reviewer and tester worktrees should be refreshed from the implementation branch rather than sharing the implementer's worktree.
_Avoid_: multiple workers operating in the same source worktree by default

## Example dialogue

Developer: Should the repo and CLI both be called pi-herd?
Domain expert: Yes.
The repo is `ribbons-digital/pi-herd`, the CLI is `pi-herd`, and the Herdr plugin id is `ribbons-digital.pi-herd`.
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
Domain expert: pi-herd should first check whether the current lead or pane is bound to a run.
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
