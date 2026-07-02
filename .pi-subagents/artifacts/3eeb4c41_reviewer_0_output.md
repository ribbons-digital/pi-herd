Now I have a thorough understanding of the entire diff. Let me compile the review.

## Review

- **Correct**: The extraction of `src/herdr.ts` cleanly consolidates all Herdr CLI invocations into typed wrapper functions, removing duplication across `start.ts`, `worktree.ts`, and `messaging.ts`. All timeout constants preserved exactly (30s launch, 10s prompt, 120s worktree create). The `metadataContainers` function is properly generalized with parameterized child keys.

- **Correct**: Stale pane detection in `messaging.ts:135-147` correctly distinguishes between "pane is gone" (non-zero exit, no timeout/error → clear and relaunch) and "can't tell" (timeout/error → throw without mutation). Test `messaging.test.ts:244-259` verifies the immutable path.

- **Correct**: Readiness wait (`waitForRoleReady`) is applied at the right points: `start.ts:70` before planner kickoff, `messaging.ts:53` only for freshly launched panes (`launchedNow` flag). Warning-only fallback matches the spec. Test `start.test.ts:142-156` verifies warn-but-send behavior.

- **Correct**: `launchedNow` flag prevents double-wait -- sessions launched during `startRun` and then having their first message sent via `sendMessage` won't re-wait because `ensureRolePane` only sets `launchedNow` when it creates a new session, and the pane already exists from `startRun`.

- **Correct**: Output text fix in `messaging.ts:66` -- `...activation` (spreading a string array) was changed to `...activation.notes` (now that `ensureRolePane` returns an object). Without this fix the code would not compile against the updated return type.

- **Fixed**: `start.ts:6` imports `paneRun as runInPane` to avoid collision with the local variable name `paneRun` on `start.ts:232`. This alias is used correctly throughout.

- **Note**: `stringFromJson` in `start.ts:329-341` changed from recursive search (using `metadataContainers` + `stringFromRecords`) to top-level-only key lookup. This is only used as a fallback in `createLeadWorkspace` (line 270), after `parsePaneMetadata` (which *does* search recursively) and `firstToken`. The practical risk is low, but if `herdr workspace create` returns enveloped JSON that `parsePaneMetadata` can't parse, the fallback is now weaker.

- **Note**: Variable shadowing in `parseWorktreeCreateResult` (`herdr.ts:106-108`) -- the loop variables `path` and `branch` shadow the `options.path` and `options.branch` parameters. The logic is correct despite shadowing (the parsed values are compared against options values, and `options.path` is used in the returned object), but this is a maintainability smell.

- **Note**: `ParsedWorktreeCreateResult.herdr_workspace_id` is typed as `string` (non-nullable) but `MaterializedWorktree.herdr_workspace_id` is `string | null`. The `parseHerdrWorktreeResult` wrapper in `worktree.ts:218-226` returns a `MaterializedWorktree | null` by casting via `parseWorktreeCreateResult`, which always returns `herdr_workspace_id: string`. This is fine since both return types are for Herdr-created worktrees, and the git fallback returns `null` for `herdr_workspace_id`. No runtime issue.

- **Note**: The new `HERDR_READY_RUNNER_TIMEOUT_MS = 20_000` provides a 5s buffer over `HERDR_READY_WAIT_TIMEOUT_MS = 15_000`. This is reasonable for command startup overhead, but if `herdr wait agent-status` takes unusually long to spawn, you could get a runner timeout before the Herdr-side timeout expires. Minor risk.