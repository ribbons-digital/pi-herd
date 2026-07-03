# Herdr and Pi Capability Report

Status: Slice 0 discovery result, with Slice 9 plugin capability additions and Slice 10 Pi extension capability additions.

Date: 2026-07-01.

## Summary

The installed Herdr and Pi versions expose enough CLI surface to build pi-herd without guessing the first implementation contracts.
Herdr provides workspace, worktree, tab, pane, agent, wait, integration, and plugin command families.
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

### Plugin

Verified command family:

```text
herdr plugin install <owner>/<repo>[/subdir...] [--ref REF] [--yes]
herdr plugin uninstall <plugin_id|owner/repo[/subdir...]>
herdr plugin link <path> [--disabled]
herdr plugin list [--plugin ID] [--json]
herdr plugin config-dir <plugin_id>
herdr plugin unlink <plugin_id>
herdr plugin enable <plugin_id>
herdr plugin disable <plugin_id>
herdr plugin action <list|invoke>
herdr plugin log list [--plugin ID] [--limit N]
herdr plugin pane <open|focus|close>
herdr plugin action list [--plugin ID]
herdr plugin action invoke <action_id> [--plugin ID]
```

Manifest contract from Herdr documentation:

- A plugin is a directory containing `herdr-plugin.toml`.
- The required top-level fields are `id`, `name`, `version`, and `min_herdr_version`.
- Command values are argv arrays and are not interpreted through a shell.
- Build commands run during GitHub plugin install and do not receive runtime plugin context.
- Runtime commands run with the plugin directory as their working directory.
- Runtime commands receive plugin env such as `HERDR_PLUGIN_ROOT`, `HERDR_PLUGIN_CONTEXT_JSON`, `HERDR_PLUGIN_ACTION_ID`, and `HERDR_BIN_PATH`.

Live probe result:

- A temporary local plugin linked successfully with `herdr plugin link <path>`.
- `herdr plugin action list --plugin <id>` returned the declared action metadata.
- `herdr plugin action invoke <qualified-action-id>` launched the action asynchronously and recorded stdout and stderr in `herdr plugin log list`.
- `herdr plugin action invoke <qualified-action-id> extra` failed with `unknown option: extra`, so Herdr 0.7.1 action invocation does not expose arbitrary action arguments through the CLI.
- The action runtime working directory was the plugin root.
- The runtime env included `HERDR_ENV=1`, `HERDR_PLUGIN_ID`, `HERDR_PLUGIN_ROOT`, `HERDR_PLUGIN_CONFIG_DIR`, `HERDR_PLUGIN_STATE_DIR`, `HERDR_PLUGIN_CONTEXT_JSON`, `HERDR_PLUGIN_ACTION_ID`, `HERDR_BIN_PATH`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, and `HERDR_PANE_ID`.
- The runtime env did not include `PI_CODING_AGENT` in the probe, so plugin actions must not assume Pi lead binding survives invocation.
- The context JSON included `workspace_id`, `workspace_label`, `workspace_cwd`, `tab_id`, `tab_label`, `focused_pane_id`, `focused_pane_cwd`, `focused_pane_agent`, `focused_pane_status`, `invocation_source`, and `correlation_id`.
- `herdr pane current --pane <focused_pane_id>` returned JSON with `result.pane.cwd` and `result.pane.foreground_cwd`, so the plugin wrapper can use it as a fallback when context cwd fields are missing.

Implementation contract:

- Herdr plugin actions for pi-herd must resolve the target project cwd from verified plugin context or Herdr pane metadata before invoking repository-targeting CLI commands.
- Repository-targeting plugin actions must fail closed when no target project cwd can be resolved.
- Plugin actions must not rely on `PI_CODING_AGENT=true` being present.
- Pane-based active-run binding is not guaranteed under plugin invocation because the probe did not include `PI_CODING_AGENT=true`, so commands should preserve the existing explicit `--run` and single-active-run fallback behavior rather than guessing.
- Herdr 0.7.1 action invocation does not provide arbitrary action args, so actions that need user input, such as `start <goal>`, should print usage instead of guessing from context.
- The plugin wrapper should prefer `HERDR_BIN_PATH` when it needs to call Herdr itself.

### Pi extension

Verified documentation and examples:

```text
Pi extensions export a default function that receives an ExtensionAPI.
Extensions can register slash commands with pi.registerCommand(name, options).
Command handlers receive args as a string and a command context.
The command context exposes ctx.cwd, ctx.hasUI, and ctx.ui.notify.
Extensions can be loaded from ~/.pi/agent/extensions, project-local .pi/extensions, or with pi -e.
```

Live probe result:

- A temporary extension loaded with `pi -e /tmp/pi-herd-extension-probe.ts` registered a slash command and handled `/probe-herd hello world` in print mode.
- The handler received `args` as the string `hello world`.
- The handler received `ctx.cwd` as the current project checkout.
- Print mode reported `ctx.hasUI=false` while still exposing `ctx.ui.notify` as a function.
- A probe run with `HERDR_ENV=1`, `HERDR_PANE_ID=probe-pane`, and `PI_CODING_AGENT=true` showed those env values were visible inside the extension handler.
- A child process spawned by the extension inherited the same Herdr and Pi env values.
- A compiled `dist/pi-extension.js` smoke test handled `/herd help` and printed usage in print mode.
- A compiled `dist/pi-extension.js` smoke test invoked the configured CLI for `/herd status --run definitely-missing` and surfaced the CLI failure output.

Implementation contract:

- Register one slash command named `/herd` and parse lead-oriented subcommands inside it.
- Map `/herd status`, `/herd brief`, `/herd collect`, and `/herd send` to the existing `pi-herd lead` command family instead of duplicating orchestration logic.
- Keep `/herd collect` mapped to read-only `pi-herd lead collect`; top-level `pi-herd collect` remains the state-writing final collection command.
- Run child CLI commands with `cwd` set to `ctx.cwd` so existing repository and active-run resolution semantics are preserved.
- Prefer `PI_HERD_CLI` when provided, then sibling `dist/cli.js` for symlinked extension installs, then `pi-herd` on `PATH`.
- Bound command output before notifying the user or printing in non-UI modes.
- Register no agent-callable tools in the first extension slice.
- Do not expose destructive cleanup, merge, or worktree-removal operations through the extension.
- Treat the extension as a convenience surface only; orchestration state remains owned by the CLI and run artifacts.

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
- Slice 9 plugin packaging should use the Herdr plugin manifest contract, resolve target project directories for repository-targeting actions from plugin context or pane metadata, fail closed when no target is available, avoid relying on Pi lead binding in plugin invocation, expose `doctor`, `start`, `status`, `collect`, and report-only `cleanup`, and print usage for `start` until Herdr can pass goal text.
