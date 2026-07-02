# Herdr and Pi Capability Report

Status: Slice 0 discovery result.

Date: 2026-07-01.

## Summary

The installed Herdr and Pi versions expose enough CLI surface to build pi-herd without guessing the first implementation contracts.
Herdr provides workspace, worktree, tab, pane, agent, wait, and integration command families.
Pi exposes the launch flags needed for provider, model, thinking, session naming, session ids, session directories, tool restrictions, and model listing.

The primary implementation risk is not command availability.
The primary implementation risk is correctly mapping raw Herdr and Pi activity signals into pi-herd's orchestration statuses.
The product should treat Herdr agent status as an input signal and continue to require artifact validation before a worker is marked `done`.

## Environment verified

```text
Herdr: 0.7.1
Pi: 0.80.2
Herdr server: running and protocol-compatible
Herdr Pi integration: current v3
Current pane env: HERDR_ENV=1, HERDR_WORKSPACE_ID, HERDR_TAB_ID, HERDR_PANE_ID
Current Pi env: PI_CODING_AGENT=true
```

## Herdr command surface

### Workspace

Verified command family:

```text
herdr workspace list
herdr workspace create [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus] [--no-focus]
herdr workspace get <workspace_id>
herdr workspace focus <workspace_id>
herdr workspace rename <workspace_id> <label>
herdr workspace close <workspace_id>
```

Implementation contract:

- Use `workspace create` for shell-launched runs that need a new lead workspace.
- Use existing `HERDR_WORKSPACE_ID` when the command is invoked from a detectable lead pane.
- Store `workspace_id` in run state.

### Worktree

Verified command family:

```text
herdr worktree list [--workspace ID | --cwd PATH] [--json]
herdr worktree create [--workspace ID | --cwd PATH] [--branch NAME] [--base REF] [--path PATH] [--label TEXT] [--focus] [--no-focus] [--json]
herdr worktree open [--workspace ID | --cwd PATH] (--path PATH | --branch NAME) [--label TEXT] [--focus] [--no-focus] [--json]
herdr worktree remove --workspace ID [--force] [--json]
```

Live probe result:

- `herdr worktree create --workspace <source-workspace> --branch <branch> --base main --path <path> --json` created a linked worktree and a new Herdr workspace for that worktree.
- The JSON result included the new workspace id, root pane id, checkout path, branch, and linked-worktree metadata.
- `herdr worktree list --workspace <source-workspace> --json` listed both the source checkout and linked worktree.
- `herdr worktree remove` expects the linked worktree workspace id, not the source workspace id.

Implementation contract:

- Capture the workspace id returned by `worktree create` for any linked worktree.
- Use that linked worktree workspace id when removing the worktree through Herdr.
- Fall back to raw `git worktree` commands only when Herdr worktree creation exits nonzero or Herdr cannot be spawned.
- If Herdr times out or exits successfully but does not expose usable matching metadata, fail clearly instead of attempting git fallback against the same target.

### Tab and pane

Verified command families:

```text
herdr tab list [--workspace <workspace_id>]
herdr tab create [--workspace <workspace_id>] [--cwd PATH] [--label TEXT] [--env KEY=VALUE] [--focus] [--no-focus]
herdr tab get <tab_id>
herdr tab focus <tab_id>
herdr tab rename <tab_id> <label>
herdr tab close <tab_id>
```

```text
herdr pane list [--workspace <workspace_id>]
herdr pane current [--pane ID|--current]
herdr pane get <pane_id>
herdr pane layout [--pane ID|--current]
herdr pane process-info [--pane ID|--current]
herdr pane read <pane_id> [--source visible|recent|recent-unwrapped] [--lines N] [--format text|ansi] [--ansi]
herdr pane split [<pane_id>|--pane ID|--current] --direction right|down [--ratio FLOAT] [--cwd PATH] [--env KEY=VALUE] [--focus] [--no-focus]
herdr pane close <pane_id>
herdr pane send-text <pane_id> <text>
herdr pane send-keys <pane_id> <key> [key ...]
herdr pane run <pane_id> <command>
```

Live probe result:

- `herdr pane current --current` returns the current pane, including agent label, agent status, cwd, terminal id, tab id, and workspace id.
- `herdr pane process-info --current` returns foreground process information and identified the current foreground process as `pi`.
- `herdr pane read` can read recent pane output.
- `herdr pane send-text` plus `herdr pane send-keys enter` reliably submitted text to a probe process.

Implementation contract:

- Prefer `pane send-text` plus `pane send-keys enter` when the message should be submitted to an interactive prompt.
- Do not rely on `agent send` alone to submit prompts, because it writes literal text without an Enter key.
- Store pane ids in state but revalidate them before use.

### Agent

Verified command family:

```text
herdr agent list
herdr agent get <target>
herdr agent read <target> [--source visible|recent|recent-unwrapped] [--lines N] [--format text|ansi] [--ansi]
herdr agent send <target> <text>
herdr agent rename <target> <name>|--clear
herdr agent focus <target>
herdr agent wait <target> --status <idle|working|blocked|unknown> [--timeout MS]
herdr agent attach <target> [--takeover]
herdr agent start <name> [--cwd PATH] [--workspace ID] [--tab ID] [--split right|down] [--env KEY=VALUE] [--focus|--no-focus] -- <argv...>
herdr agent explain <target> [--json]
```

Live probe result:

- `herdr agent start <name> --cwd <path> --workspace <id> --split down --no-focus -- <argv...>` started a probe process in a new pane and returned structured JSON with the pane id and terminal id.
- `herdr agent read <name>` could read output by agent name.
- `herdr agent send <name> <text>` wrote literal text to the terminal but did not submit a newline.
- `herdr agent explain pi --json` returned the detection rules and current state used for the current Pi agent.

Implementation contract:

- Use `herdr agent start` for launching named worker sessions when available.
- Use unique names that include the run id and role.
- Use `agent read` and `agent explain` for diagnostics.
- Use `pane send-text` plus `pane send-keys enter` for prompt submission unless a future Herdr command provides submit semantics directly.

### Wait

Verified command family:

```text
herdr wait output <pane_id> --match <text> [--source visible|recent|recent-unwrapped] [--lines N] [--timeout MS] [--regex] [--raw]
herdr wait agent-status <pane_id> --status <idle|working|blocked|done|unknown> [--timeout MS]
```

Live probe result:

- `herdr wait agent-status <pane_id> --status working --timeout 1000` returned an agent status event for the current Pi pane.
- `herdr wait agent-status <pane_id> --status done --timeout 5000` against a short-lived probe process timed out, and the pane disappeared after the process exited.
- The `done` value appears in `herdr wait agent-status --help`, but was not observed as a delivered event in the live probe.
- `herdr agent wait --help` lists `idle|working|blocked|unknown` and does not list `done`, so status support differs between the two wait surfaces.

Implementation contract:

- Use Herdr wait commands for bounded waits.
- Treat Herdr status values as activity signals.
- Do not depend on Herdr `done` until Slice 6 verifies when it is emitted.
- Map Herdr `idle` or a stopped or missing pane/process signal plus valid artifact to pi-herd `done`.
- Map Herdr `idle` or a stopped or missing pane/process signal plus missing or invalid artifact to pi-herd `incomplete`.

### Integration

Verified command family:

```text
herdr integration install pi
herdr integration uninstall pi
herdr integration status [--outdated-only]
```

Live probe result:

```text
pi: current (v3) (/Users/shiang/.pi/agent/extensions/herdr-agent-state.ts)
```

Implementation contract:

- `pi-herd doctor` should check `herdr integration status` and warn if Pi integration is missing or outdated.
- The Pi integration should be treated as the preferred source of status metadata when available.

## Pi command surface

Verified Pi version:

```text
pi 0.80.2
```

Relevant launch flags:

```text
--provider <name>
--model <pattern>
--models <patterns>
--thinking <level>
--name <name>
--session <path|id>
--session-id <id>
--session-dir <dir>
--continue
--resume
--fork <path|id>
--no-session
--tools <tools>
--exclude-tools <tools>
--no-tools
--no-builtin-tools
--list-models [search]
--approve
--no-approve
--offline
```

Implementation contract:

- The Pi harness adapter can pass provider, model, thinking, session name, session id, session directory, and tool preferences directly through CLI flags.
- Model availability should remain owned by Pi.
- `pi-herd doctor` can optionally call `pi --list-models <search>` or show a warning when a configured model cannot be found, but pi-herd should not maintain its own model catalog.

## Lead binding detection

Current Pi session inside Herdr exposes:

```text
HERDR_ENV=1
HERDR_WORKSPACE_ID=w2
HERDR_TAB_ID=w2:t1
HERDR_PANE_ID=w2:p1
HERDR_SOCKET_PATH=/Users/shiang/.config/herdr/herdr.sock
PI_CODING_AGENT=true
```

Herdr commands also confirmed the current pane:

```text
herdr pane current --current
herdr pane process-info --current
```

Implementation contract:

- A command running with `HERDR_ENV=1`, `HERDR_PANE_ID`, and `PI_CODING_AGENT=true` can be treated as running inside a Pi lead candidate.
- The implementation should verify the pane using `herdr pane current --current` or `herdr pane get $HERDR_PANE_ID` before binding it as lead.
- If the environment is missing or verification fails, `pi-herd start` should create a lead pane instead of guessing.

## Prompt sending contract

Herdr has two different text-sending behaviors:

- `herdr agent send <target> <text>` writes literal text and does not submit Enter.
- `herdr pane send-text <pane_id> <text>` plus `herdr pane send-keys <pane_id> enter` writes and submits a line.

Implementation contract:

- Use pane-level send-text plus Enter for worker prompts.
- Keep agent-level send as a lower-level primitive only when literal text insertion is desired.
- Log the sending method in verbose or debug output because prompt delivery is critical.

## Completion signal contract

Herdr can report agent state through:

- `herdr agent list`
- `herdr pane current`
- `herdr pane get`
- `herdr agent explain <target> --json`
- `herdr wait agent-status <pane_id> --status <status>`

Implementation contract:

- Raw Herdr status is not pi-herd worker completion.
- Raw status is an activity signal.
- The Herdr `done` wait value is listed in help but was not observed in the live probe, so Slice 6 must not rely on it without re-verification.
- pi-herd completion requires stopped or idle-like activity plus required artifact completion.
- `blocked` should be captured when Herdr reports blocked or when the worker writes an explicit blocker artifact or inbox request.
- `failed` should be reserved for orchestration errors such as missing pane, failed command, missing worktree, or process launch failure.

## Fallback paths

If `herdr agent start` is unavailable or fails for a worker session after a lead pane exists:

- Create a pane with `herdr pane split` or a tab with `herdr tab create`.
- Launch the harness with `herdr pane run <pane_id> <command>`.
- Store the pane id even if there is no agent name.

If `herdr agent send` does not provide submit semantics:

- Use `herdr pane send-text` followed by `herdr pane send-keys enter`.

If Herdr worktree creation exits nonzero or Herdr cannot be spawned:

- Fall back to raw `git worktree add` for Slice 3 run creation, where panes and Herdr workspace opening are out of scope.
- Later launch slices may open an existing raw-git fallback worktree in Herdr when a visible pane or workspace is needed.

If Herdr Pi integration is missing:

- Warn in `doctor`.
- Continue with process and pane-level fallbacks where possible.
- Mark status confidence lower in JSON output.

## Decisions for implementation slices

- Slice 1 `doctor` should check Herdr server status, Pi command availability, Herdr Pi integration status, git repo, and git worktree support.
- Slice 2 state stores Herdr workspace, tab, and pane ids plus a nullable `session_ref` placeholder for harness session identity.
- Slice 3 worktree creation should call Herdr first, trust the result only when JSON metadata matches the requested branch and absolute path, and fall back to raw `git worktree add` without creating panes or sessions only when Herdr exits nonzero or cannot be spawned.
- If Herdr times out or exits successfully without usable matching metadata, Slice 3 should fail clearly rather than attempt git fallback against the same target.
- Slice 4 uses `herdr agent start` where possible, falls back to `pane split` plus `pane run` for worker sessions when a lead pane exists, and stores pane/session refs plus launch metadata after each successful step.
- Slice 4 submits the planner kickoff with pane send-text plus Enter.
- Slice 5 should extend prompt sending beyond planner kickoff to lead commands and role messaging.
- Slice 6 completion logic should consume Herdr activity signals but require artifact validation before marking workers done.
