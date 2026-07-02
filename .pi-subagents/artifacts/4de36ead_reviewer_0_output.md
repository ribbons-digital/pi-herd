Now I have enough context. Let me compile my findings.

---

## Review

### Correct (good design decisions)
- `persistRoleDecisions` `last_activity_at` guard (status.ts:267) correctly prevents stale observations from overwriting roles that were active after probing.
- The `updateRunState` `return false` skip (run-state.ts:572) avoids unnecessary revision bumps when the fresh state needs no changes.
- `evaluateRole` (status.ts:196-205) correctly returns terminal statuses immediately, handles `blocked → working` re-polling, and never maps `unknown` to `done`.
- `isWaitTarget` uses `stored_status`, not `evaluated_status`, so a stored `blocked` role with working signal correctly stays in the polling pool.
- `isWaitTarget`/`isMutableStatus` are correctly scoped to `working`/`blocked` only, excluding `pending`/`staged` from both wait targets and mutation candidates.
- `canApplyDecision` correctly requires `isMutableStatus`, `last_activity_at` match, and status inequality before allowing a persist.
- Exit code logic: 0 for all cleanly done, 2 for timeout, 3 for incomplete/blocked/failed/working -- consistent with spec.
- `hasUnresolvedOrNegativeVerdict` correctly only flags `incomplete`/`blocked`/`failed`/`working`, leaving `staged`/`pending` roles neutral.

### Bug found

**`status.ts:400-404` -- `truncateBytes` truncates by character index, not byte index.**

```typescript
function truncateBytes(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes <= maxBytes) return value;
  return `${value.slice(0, maxBytes)}\n... truncated to ${maxBytes} bytes ...`;
}
```

`String.prototype.slice(0, maxBytes)` slices by UTF-16 code units (≈ JavaScript characters), not by UTF-8 bytes. For ASCII-only content this is harmless (1 char = 1 byte). For non-ASCII content (CJK, emoji, accented characters), the truncated result can be multiple times the byte budget. For example, 24,000 CJK characters (~72,000 bytes) would pass through where the budget is 24,000 bytes.

This affects:
- Artifact previews in `artifactStatuses` (status.ts:240) via `OUTPUT_BUDGETS.artifactPreviewBytes` (24,000 bytes)
- The artifact preview sections in `FINAL_SUMMARY.md` via `formatFinalSummary`

**Severity**: Low. Most artifact content (PLAN.md, IMPLEMENTATION_NOTES.md, REVIEW.md, TEST_REPORT.md) is ASCII-heavy markdown. Non-ASCII artifacts would produce previews exceeding the byte budget, but this is a display/output issue, not a correctness or safety bug.

**Fix**: Replace `value.slice(0, maxBytes)` with byte-aware truncation, e.g.:
```typescript
const buf = Buffer.from(value, 'utf8');
if (buf.byteLength <= maxBytes) return value;
return `${buf.slice(0, maxBytes).toString('utf8')}\n... truncated to ${maxBytes} bytes ...`;
```

### Notes

**`readRoleSignal` sequential probing (status.ts:215-224)**
Each role probes up to 4 agent statuses sequentially (`done`, `blocked`, `idle`, `working`) at 250ms each, for up to ~1s per role. In `waitRun`'s polling loop, this happens every cycle for all active roles. Not a bug, but with many active roles the per-cycle cost grows. The default 2s poll interval makes this acceptable for 4 roles (~1s probing ≤ 2s interval), but worth noting if more roles are added.

**`persistRoleDecisions` early-return on `observedState` without lock (status.ts:256-258)**
When `canApplyDecision` returns false for all decisions against the (possibly stale) `observedState`, the function skips the lock entirely and returns `observedState`. The returned state's `state_revision` and `updated_at` may be behind the real state on disk. This only affects the consumer snapshot display, not persisted state correctness, since no changes were needed anyway.

**`writeTextAtomic` doesn't clean up temp files on rename failure (status.ts:405-409)**
If `writeFile` succeeds but `rename` fails (e.g., ENOSPC), the temp file is orphaned. Same pattern as `writeJsonAtomic` in run-state.ts. Low-impact cleanliness issue; temp files are in well-known directories.

**Duplicate `isNodeErrorWithCode` (status.ts:415-417)**
This helper exists in both `run-state.ts` and `status.ts`. Consider extracting to a shared utility module to reduce duplication.

---