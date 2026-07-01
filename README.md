# pi-herd

Visible Pi session orchestration with Herdr and git worktrees.

pi-herd is a Herdr-first orchestration layer for running multiple visible coding-agent sessions as isolated, steerable workers.
It is Pi-first, but the core model is harness-neutral so future harnesses can be supported.

## Status

Design approved.
Implementation is planned as ordered GitHub issues and pull requests.

## Docs

- [Product spec](docs/spec.md)
- [Slice plan](docs/slices.md)
- [Approval plan](docs/approval-plan.md)
- [Domain language](CONTEXT.md)
- [ADRs](docs/adr/)

## Development workflow

Use `pnpm` for package management.
Do not use `npm`.
After initial repository setup, work proceeds one issue per branch and one pull request per issue.
