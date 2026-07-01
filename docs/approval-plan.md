# pi-herd Approval Plan

Status: Ready for Plannotator review.

## Review provenance

The design was grilled with the user decision by decision.
Opus 4.8 reviewed the draft with high-effort thinking and requested changes.
The executor debated the requested changes with Opus 4.8 until consensus.
The current docs incorporate the consensus.

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
- [ ] Use isolated worktree views for reviewer and tester, materialized lazily when needed.
- [ ] Treat harness idle as a signal, not completion by itself.
- [ ] Keep capability checks lightweight and avoid a heavy permission policy engine.
- [ ] Use token-aware bounded output defaults from day one.
- [ ] Use Memory Lane for continuity and do not create `HANDOFF.md`.

## Slice plan to approve

- [ ] Slice 0: Herdr and Pi capability discovery.
- [ ] Slice 1: CLI foundation, doctor, and init.
- [ ] Slice 2: Run state and artifact model.
- [ ] Slice 3: Worktree orchestration.
- [ ] Slice 4: Herdr pane and session launch.
- [ ] Slice 5: Messaging and lead commands.
- [ ] Slice 6: Status, wait, and collect.
- [ ] Slice 7: Refresh, diff, and review/test flow.
- [ ] Slice 8: Cleanup and merge planning.
- [ ] Slice 9: Herdr plugin packaging.
- [ ] Slice 10: Optional Pi extension.

## After approval

- [ ] Create a private `ribbons-digital/pi-herd` GitHub repo.
- [ ] Create one GitHub issue per slice in order.
- [ ] Start Slice 0 only after user approval.
- [ ] Use one branch and one PR per issue.
- [ ] Do not push directly to `main` after initial setup.
