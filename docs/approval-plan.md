# pi-herd Approval Plan

Status: Design approved, with Slice 0 capability discovery through Slice 9 Herdr plugin packaging plus H1 and H2 hardening complete on the current branch.

## Review provenance

The design was grilled with the user decision by decision.
Opus 4.8 reviewed the draft with high-effort thinking and requested changes.
The executor debated the requested changes with Opus 4.8 until consensus.
The current docs incorporate the consensus.
Slice 0 verified the Herdr and Pi capability contract and recorded it in the capability report and ADR 0008.
Slice 1 added the TypeScript CLI foundation, `init`, `doctor`, config validation, tests, and README updates in PR #13.
Slice 2 added `pi-herd run create`, canonical run artifacts, pending role state, active-run resolution helpers, and atomic state writes without worktrees or worker launch.
Slice 3 added `--with-worktrees`, Herdr-first implementer worktree creation, git fallback only after Herdr creation exits nonzero or fails to spawn, optional planner worktree creation, dirty and collision checks, worktree state persistence, and failed-run persistence without panes or worker launch.
Slice 4 added `pi-herd start`, verified or created lead binding, planner launch with kickoff prompt, staged implementer launch, reviewer and tester staged slots, launch metadata persistence, and recoverable failed-run persistence after partial launch failures.
Slice 5 added `pi-herd send`, `pi-herd lead status`, `pi-herd lead send`, `pi-herd lead collect`, `pi-herd lead brief`, verified current-pane active-run resolution, first-send reviewer and tester activation, dash-prefixed literal send parsing, explicit partial-send errors, read-only collection inventory, and non-completion message semantics.
H1 added a shared Herdr client layer, broader metadata parsing, idle readiness waits before first prompt delivery, warning-only readiness fallback, stale pane validation with safe relaunch, and a pinned multi-line prompt delivery shape.
H2 added shared run resolution, verified current-pane targeting, run listing, role-worktree run discovery, git-root and base-ref guards, additive `state_revision` provenance, locked state updates for messaging writes, and safer run-directory allocation.
Slice 6 added `pi-herd status`, `pi-herd wait`, and top-level `pi-herd collect`, including artifact validation, role verdict persistence, bounded pane-log collection, `FINAL_SUMMARY.md` generation, and non-closing collect semantics.
Slice 7 added `pi-herd refresh reviewer/tester`, `pi-herd diff`, forced-refresh backup refs and dirty stashes, repeated-pass artifact freshness, dirty artifact-only role warnings, and repeated-pass prompt guidance.
Slice 8 added `pi-herd merge-plan`, `pi-herd cleanup`, `MERGE_DECISION.md`, provider-aware safe worktree removal, worker-pane cleanup, and explicit completed or abandoned lifecycle closure without automatic merging or branch deletion.
Slice 9 added the Herdr plugin manifest, verified the Herdr plugin action contract, exposed doctor/start/status/collect/report-only cleanup actions, added a fail-closed action wrapper, and documented plugin development.

## Files to approve

- [ ] `CONTEXT.md`
- [ ] `docs/spec.md`
- [ ] `docs/slices.md`
- [ ] `docs/adr/0001-herdr-first-visible-sessions.md`
- [ ] `docs/adr/0002-pi-first-harness-neutral-model.md`
- [ ] `docs/adr/0003-canonical-run-directory.md`
- [ ] `docs/adr/0004-lead-owned-orchestration.md`
- [ ] `docs/adr/0005-worker-status-model.md`
- [ ] `docs/adr/0006-lazy-reviewer-tester-worktrees.md`
- [ ] `docs/adr/0007-run-lifecycle-and-state-schema.md`
- [ ] `docs/adr/0008-herdr-pi-capability-contract.md`
- [ ] `docs/capabilities/herdr-pi-capability-report.md`

## Decisions captured

- [ ] Use `ribbons-digital/pi-herd` as the GitHub repo and `pi-herd` as the CLI.
- [ ] Build a Herdr-first orchestrator instead of hidden subagents.
- [ ] Keep the model Pi-first but harness-neutral.
- [ ] Treat a run as one complete orchestration container for one user goal.
- [ ] Support multiple parallel active runs.
- [ ] Use explicit active-run resolution and fail on ambiguity.
- [ ] Bind a current Pi session as lead when detectable.
- [ ] Keep lead-owned orchestration and worker requests through artifacts or inbox.
- [ ] Use one canonical run directory under `.pi-herd/runs/{run_id}`.
- [ ] Materialize the implementer worktree on `--with-worktrees` and the planner worktree only when explicitly requested.
- [ ] Use isolated worktree views for reviewer and tester, materialized lazily when needed.
- [ ] Treat harness idle as a signal, not completion by itself.
- [ ] Use the Slice 0 Herdr and Pi capability contract for launch, prompt sending, lead binding, pane validation, readiness waits, and completion signals.
- [ ] Keep capability checks lightweight and avoid a heavy permission policy engine.
- [ ] Use token-aware bounded output defaults from day one.
- [ ] Use Memory Lane for continuity and do not create `HANDOFF.md`.

## Slice plan to approve

- [x] Slice 0: Herdr and Pi capability discovery.
- [x] Slice 1: CLI foundation, doctor, and init.
- [x] Slice 2: Run state and artifact model.
- [x] Slice 3: Worktree orchestration.
- [x] Slice 4: Herdr pane and session launch.
- [x] Slice 5: Messaging and lead commands.
- [x] H1: Herdr client and prompt-delivery reliability.
- [x] H2: Run resolution and state-write safety.
- [x] Slice 6: Status, wait, and collect.
- [x] Slice 7: Refresh, diff, and review/test flow.
- [x] Slice 8: Cleanup and merge planning.
- [x] Slice 9: Herdr plugin packaging.
- [ ] Slice 10: Optional Pi extension.

## After Slice 9

- [ ] Continue with one branch and one PR per issue.
- [ ] Recheck Herdr or Pi command behavior if either tool version changes.
- [ ] Live-probe Herdr multi-line `pane send-text` behavior before changing the current single-payload prompt delivery shape.
- [ ] Implement Slice 10 optional Pi extension on top of the Herdr plugin packaging.

## Slice 6 implementation guardrails

- [x] Keep `lead collect` read-only after full `pi-herd collect` is implemented.
- [x] Require required artifact presence before marking workers `done`.
- [x] Preserve bounded terminal output and brief output.
- [ ] Let no-mistakes handle final validation, PR updates, and CI.
