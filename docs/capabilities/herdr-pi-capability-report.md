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
- Send multi-line prompts as one `pane send-text` payload plus `pane send-keys enter` until a later live probe justifies changing the shape.
- Do not rely on `agent send` alone to submit prompts, because it writes literal text without an Enter key.
- Store pane ids in state but revalidate them before use with `pane get` or equivalent Herdr metadata.
- Treat a clear missing-pane response as stale saved state that can be relaunched before sending.
- Treat timeouts, capability errors, and ambiguous pane validation failures as stop conditions that leave saved pane state intact.

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
- Wait briefly for `idle` before the first prompt sent to a freshly launched worker pane.
- Treat readiness wait failure as warning-only for prompt delivery, not as worker completion or launch failure.
- Treat Herdr status values as activity signals.
- Poll Herdr `done`, `blocked`, `idle`, and `working` as activity signals for Slice 6 status evaluation.
- Map Herdr `idle`, `done`, or a clearly missing saved pane plus valid artifact to pi-herd `done`.
- Map Herdr `idle`, `done`, or a clearly missing saved pane plus missing or invalid artifact to pi-herd `incomplete`.
- Map Herdr `blocked` to pi-herd `blocked`.
- Treat unsupported status waits, ambiguous pane validation failures, and other unclear activity reads as `unknown` signals that never become `done` by themselves.

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
- Submit multi-line prompt text as a single send-text payload followed by Enter unless a future live probe shows Herdr needs line-by-line insertion.
- Before sending to a saved pane ref, validate that the pane still exists.
- If validation clearly reports a missing pane, relaunch the role session before sending.
- If validation times out, reports an unsupported command, or fails ambiguously, stop without clearing saved pane state.
- After fresh launch, wait briefly for the target pane to report idle readiness and warn rather than fail if readiness cannot be confirmed.
- If send-text succeeds but Enter submission fails, treat the target pane as potentially containing unsubmitted text because retrying may duplicate the prompt.
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
- The Herdr `done` wait value is listed in help but was not observed in the live probe, so it is only one possible activity signal and still requires artifact validation.
- pi-herd completion requires stopped, done, or idle-like activity plus fresh required artifact completion.
- A saved pane that Herdr clearly reports as missing can be treated as stopped for completion evaluation.
- Ambiguous pane validation failures and unsupported status waits should produce an `unknown` signal and should not mark the role `done`.
- `blocked` should be captured when Herdr reports blocked or when the worker writes an explicit blocker artifact or inbox request.
- `failed` should be reserved for orchestration errors such as failed command, missing worktree, or process launch failure.

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
- Slice 5 extends prompt sending beyond planner kickoff to lead commands and role messaging with pane send-text plus Enter, and reports partial failure clearly if Enter submission fails after text insertion.
- H1 centralizes Herdr command wrappers, validates saved panes before send, relaunches clearly missing panes, waits briefly for idle readiness before first prompt delivery after fresh launch, and keeps readiness failures warning-only.
- H2 uses verified current Herdr/Pi pane metadata for run targeting before falling back to single-active-run resolution.
- Slice 6 completion logic consumes Herdr activity signals, requires non-empty required artifacts before marking workers done, keeps `status` read-only, persists `wait` and top-level `collect` role verdicts through locked state updates, and writes `FINAL_SUMMARY.md` from top-level `collect`; Slice 7 adds freshness checks.
- Slice 7 repeated-pass logic treats artifacts older than role activity as stale, warns when reviewer or tester worktrees contain source changes, refreshes reviewer and tester worktrees from the implementation branch with forced-refresh backup refs and dirty stashes, and reports implementation diffs with a bounded merge-base range.
- Slice 8 cleanup closes worker panes with `herdr pane close` (skipping the lead pane) and removes role worktrees with `herdr worktree remove --workspace` using the stored linked-worktree workspace id when Herdr provider metadata is available, falling back to raw `git worktree remove` otherwise; it never closes the lead pane and never deletes role branches.
