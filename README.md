# pi-herd

Visible Pi session orchestration with Herdr and git worktrees.

pi-herd is a Herdr-first orchestration layer for running multiple visible coding-agent sessions as isolated, steerable workers.
It is Pi-first, but the core model is harness-neutral so future harnesses can be supported.

## Status

Design approved.
Slice 0 capability discovery is complete.
Slice 1 is adding the first TypeScript CLI foundation.
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
```

`pi-herd init` creates `.pi-herd/config.yaml`, `.pi-herd/runs/`, role prompt templates under `.pi-herd/prompts/`, and safe ignore entries.
It does not overwrite existing config or prompts unless `--force` is passed.

`pi-herd doctor` checks git, git worktree support, Pi, Herdr, Herdr server reachability, Herdr Pi integration status, and the local config when present.
Warnings do not make the command fail, but hard failures such as invalid config or missing git repo do.

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
