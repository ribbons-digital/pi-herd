# pi-herd

Visible Pi session orchestration with Herdr and git worktrees.

pi-herd is a Herdr-first orchestration layer for running multiple visible coding-agent sessions as isolated, steerable workers.
It is Pi-first, but the core model is harness-neutral so future harnesses can be supported.

## Status

Design approved.
Slice 0 capability discovery is complete.
Slice 1 CLI foundation is complete.
Slice 2 run state and artifact model is complete.
Slice 3 worktree orchestration is implemented on the current branch.
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
```

`pi-herd init` creates `.pi-herd/config.yaml`, `.pi-herd/runs/`, role prompt templates under `.pi-herd/prompts/`, and safe ignore entries.
It does not overwrite existing config or prompts unless `--force` is passed.

`pi-herd doctor` checks git, git worktree support, Pi, Herdr, Herdr server reachability, Herdr Pi integration status, and the local config when present.
Warnings do not make the command fail, but hard failures such as invalid config or missing git repo do.

`pi-herd run create` creates a canonical run directory with `REQUEST.md`, `state.json`, `logs/`, and `inbox/`.
By default it creates pending role records for `planner`, `implementer`, `reviewer`, and `tester`.
Pass `--role` one or more times to limit the selected roles, `--base-ref` to override the detected branch or commit, `--json` for the saved state, or `--config` for a custom config path.
Configured `paths.runs_dir` values must be repository-relative, remain inside the repository root, and not traverse symlinks.
Pass `--with-worktrees` to materialize the implementation worktree while leaving reviewer and tester worktrees pending.
Worktree creation requires a clean repository outside `.pi-herd/runs` and `.worktrees`, refuses existing target paths or branches, uses Herdr first, and falls back to `git worktree add` when Herdr cannot return matching metadata.
Pass `--planner-worktree` to also materialize a planner worktree; it implies `--with-worktrees`.
Created worktrees use `.worktrees/pi-herd/{run_slug}/{role}` and are listed in text output with their branch and provider.
If worktree materialization fails after the run directory is created, the saved run state is marked `failed` and is not selected as active.
It does not create panes or worker sessions.

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
