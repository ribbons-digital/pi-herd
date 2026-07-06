import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { describeFailure, notificationShow } from './herdr.js';
import { OUTPUT_BUDGETS, type RoleName } from './defaults.js';
import { resolveRunContext, updateRunState, type RoleRecord, type RoleStatus, type RunState } from './run-state.js';
import { dirtyPaths } from './refresh.js';
import { parseVerdictMarker, type VerdictMarker } from './verdict.js';
import { createHarnessAdapter, type HarnessAdapter, type HarnessRoleSignal } from './harness.js';

export interface StatusCommandOptions {
  cwd: string;
  configPath?: string;
  run?: string;
  json?: boolean;
  runner?: CommandRunner;
  now?: Date;
  harness?: HarnessAdapter;
}

export interface WaitCommandOptions extends StatusCommandOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface StatusCommandResult {
  state: RunState;
  snapshot: RunSnapshot;
  text: string;
  exitCode: number;
}

export interface RunSnapshot {
  run_id: string;
  goal: string;
  status: RunState['status'];
  state_revision: number | null;
  generated_at: string;
  roles: RoleSnapshot[];
  warnings: string[];
  final_summary_path?: string;
}

export interface RoleSnapshot {
  role: RoleName;
  stored_status: RoleStatus;
  evaluated_status: RoleStatus;
  signal: RoleSignal;
  pane_id: string | null;
  worktree_status: RoleRecord['worktree_status'];
  artifacts: ArtifactStatus[];
  warnings: string[];
  pass: number;
  verdict: VerdictMarker | null;
}

export interface ArtifactStatus {
  role: RoleName;
  name: string;
  path: string;
  present: boolean;
  valid: boolean;
  stale: boolean;
  bytes: number;
  preview?: string;
  verdict?: VerdictMarker | null;
}

type RoleSignal = HarnessRoleSignal;

interface RoleDecision {
  role: RoleName;
  nextStatus: RoleStatus;
  observedStatus: RoleStatus | null;
  observedLastActivityAt: string | null;
  shouldPersist: boolean;
}

interface PersistRoleDecisionResult {
  state: RunState;
  transitions: RoleTransition[];
}

interface RoleTransition {
  role: RoleName;
  status: RoleStatus;
}

const DEFAULT_SIGNAL_TIMEOUT_MS = 250;
const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

export async function statusRun(options: StatusCommandOptions): Promise<StatusCommandResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const snapshot = await buildSnapshot(resolved.state, runner, options.now ?? new Date(), true, options.harness);
  return {
    state: resolved.state,
    snapshot,
    text: options.json ? `${JSON.stringify(snapshot, null, 2)}\n` : formatStatusText(snapshot),
    exitCode: 0
  };
}

export async function waitRun(options: WaitCommandOptions): Promise<StatusCommandResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, 'timeout-ms');
  const pollIntervalMs = positiveInteger(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, 'poll-interval-ms');
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = Date.now();
  let latestStatePath = '';
  let latestState: RunState | null = null;
  let latestSnapshot: RunSnapshot | null = null;

  while (Date.now() - started <= timeoutMs) {
    const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
    latestStatePath = resolved.statePath;
    latestState = resolved.state;
    latestSnapshot = await buildSnapshot(resolved.state, runner, options.now ?? new Date(), true, options.harness);
    const activeRoles = latestSnapshot.roles.filter((role) => isWaitTarget(role.stored_status));
    const resolvedRoles = activeRoles.filter((role) => role.evaluated_status === 'done' || role.evaluated_status === 'incomplete' || role.evaluated_status === 'blocked');
    if (!activeRoles.length || resolvedRoles.length === activeRoles.length) {
      const persisted = await persistRoleDecisions(latestStatePath, latestState, latestSnapshot);
      const finalSnapshot = snapshotWithPersistedState(latestSnapshot, persisted.state);
      await appendNotificationWarning(finalSnapshot, runner, persisted.state, persisted.transitions);
      const hasIncomplete = hasUnresolvedOrNegativeVerdict(finalSnapshot);
      return {
        state: persisted.state,
        snapshot: finalSnapshot,
        text: options.json ? `${JSON.stringify(finalSnapshot, null, 2)}\n` : formatStatusText(finalSnapshot),
        exitCode: hasIncomplete ? 3 : 0
      };
    }
    await sleep(Math.min(pollIntervalMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }

  if (!latestState || !latestSnapshot) {
    throw new Error('No status snapshot was produced.');
  }
  const persisted = latestStatePath ? await persistRoleDecisions(latestStatePath, latestState, latestSnapshot) : { state: latestState, transitions: [] };
  const timeoutSnapshot = snapshotWithPersistedState(latestSnapshot, persisted.state);
  await appendNotificationWarning(timeoutSnapshot, runner, persisted.state, persisted.transitions);
  timeoutSnapshot.warnings.push('Timed out waiting for active roles.');
  return {
    state: persisted.state,
    snapshot: timeoutSnapshot,
    text: options.json ? `${JSON.stringify(timeoutSnapshot, null, 2)}\n` : `${formatStatusText(timeoutSnapshot)}Timed out waiting for active roles.\n`,
    exitCode: 2
  };
}

export async function collectRun(options: StatusCommandOptions): Promise<StatusCommandResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const initialSnapshot = await buildSnapshot(resolved.state, runner, options.now ?? new Date(), true, options.harness);
  const persisted = await persistRoleDecisions(resolved.statePath, resolved.state, initialSnapshot);
  const logWarnings = await collectPaneLogs(persisted.state, runner);
  const snapshot = snapshotWithPersistedState(initialSnapshot, persisted.state);
  snapshot.warnings.push(...logWarnings);
  const finalSummaryPath = join(persisted.state.canonical_run_dir, 'FINAL_SUMMARY.md');
  snapshot.final_summary_path = finalSummaryPath;
  await writeTextAtomic(finalSummaryPath, formatFinalSummary(snapshot));
  const finalSnapshot = { ...snapshot, final_summary_path: finalSummaryPath };
  const hasIncomplete = hasUnresolvedOrNegativeVerdict(finalSnapshot);
  return {
    state: persisted.state,
    snapshot: finalSnapshot,
    text: options.json ? `${JSON.stringify(finalSnapshot, null, 2)}\n` : `${formatStatusText(finalSnapshot)}Wrote ${finalSummaryPath}\n`,
    exitCode: hasIncomplete ? 3 : 0
  };
}

export async function buildSnapshot(state: RunState, runner: CommandRunner, now: Date, probeSignals: boolean, harness: HarnessAdapter = createHarnessAdapter()): Promise<RunSnapshot> {
  const roles: RoleSnapshot[] = [];
  const warnings: string[] = [];
  for (const record of roleEntries(state)) {
    const artifacts = await artifactStatuses(state, record);
    const signalResult = probeSignals ? await readRoleSignal(harness, runner, state, record) : { signal: signalFromStoredStatus(record.status), warnings: [] };
    const dirtyWarnings = await artifactOnlyWorktreeWarnings(runner, record);
    const verdict = currentPassVerdict(record, artifacts);
    const roleWarnings = [
      ...signalResult.warnings,
      ...dirtyWarnings,
      ...artifacts.filter((artifact) => artifact.stale).map((artifact) => `${artifact.name} is stale for the current pass`),
      ...verdictNotes(record, artifacts, verdict, signalResult.signal)
    ];
    const evaluatedStatus = evaluateRole(record, signalResult.signal, artifacts, verdict);
    roles.push({
      role: record.role,
      stored_status: record.status,
      evaluated_status: evaluatedStatus,
      signal: signalResult.signal,
      pane_id: record.herdr_pane_id,
      worktree_status: record.worktree_status,
      artifacts,
      warnings: roleWarnings,
      pass: record.pass ?? 0,
      verdict
    });
    warnings.push(...roleWarnings.map((warning) => `${record.role}: ${warning}`));
  }
  return {
    run_id: state.run_id,
    goal: state.goal,
    status: state.status,
    state_revision: state.state_revision ?? null,
    generated_at: now.toISOString(),
    roles,
    warnings
  };
}

function snapshotWithPersistedState(snapshot: RunSnapshot, state: RunState): RunSnapshot {
  return {
    ...snapshot,
    status: state.status,
    state_revision: state.state_revision ?? null,
    roles: snapshot.roles.map((role) => ({
      ...role,
      stored_status: state.roles[role.role]?.status ?? role.stored_status
    }))
  };
}

function evaluateRole(record: RoleRecord, signal: RoleSignal, artifacts: ArtifactStatus[], verdict: VerdictMarker | null): RoleStatus {
  if (record.status === 'done' || record.status === 'failed' || record.status === 'incomplete') return record.status;
  if (record.status === 'blocked' && signal === 'working') return 'working';
  if (signal === 'blocked') return 'blocked';
  if (signal === 'idle' || signal === 'stopped' || signal === 'done') {
    if (verdict?.verdict === 'blocked') return 'blocked';
    return artifacts.every((artifact) => artifact.valid) ? 'done' : 'incomplete';
  }
  return record.status;
}

/** Find the explicit verdict marker matching the role's current prompt pass, or null when none applies. */
function currentPassVerdict(record: RoleRecord, artifacts: ArtifactStatus[]): VerdictMarker | null {
  const pass = record.pass ?? 0;
  if (pass < 1) return null;
  for (const artifact of artifacts) {
    if (artifact.verdict && artifact.verdict.pass === pass) return artifact.verdict;
  }
  return null;
}

/** Warning notes about stale, missing, or blocked verdict markers; silent for legacy roles that never received the verdict protocol. */
function verdictNotes(record: RoleRecord, artifacts: ArtifactStatus[], verdict: VerdictMarker | null, signal: RoleSignal): string[] {
  const pass = record.pass ?? 0;
  if (pass < 1) return [];
  const notes: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.verdict && artifact.verdict.pass !== pass) {
      notes.push(`${artifact.name} verdict marker is for pass ${artifact.verdict.pass}; current pass is ${pass}`);
    }
  }
  const workStopped = signal === 'idle' || signal === 'stopped' || signal === 'done';
  if (!verdict && workStopped && artifacts.length > 0 && artifacts.every((artifact) => artifact.valid)) {
    notes.push(`no verdict marker for pass ${pass}; completion inferred from artifact freshness`);
  }
  if (verdict?.verdict === 'blocked') {
    const detail = verdict.summary ? `: ${verdict.summary}` : '';
    notes.push(workStopped
      ? `reported blocked for pass ${pass}${detail}`
      : `blocked marker present for pass ${pass} but the worker is still active${detail}`);
  }
  return notes;
}

async function readRoleSignal(harness: HarnessAdapter, runner: CommandRunner, state: RunState, record: RoleRecord): Promise<{ signal: RoleSignal; warnings: string[] }> {
  return harness.readRoleSignal({ runner, state, record, timeoutMs: DEFAULT_SIGNAL_TIMEOUT_MS });
}

async function artifactStatuses(state: RunState, record: RoleRecord): Promise<ArtifactStatus[]> {
  const statuses: ArtifactStatus[] = [];
  for (const name of record.required_artifacts) {
    const path = join(state.canonical_run_dir, name);
    const status: ArtifactStatus = { role: record.role, name, path, present: false, valid: false, stale: false, bytes: 0 };
    try {
      const [raw, fileStat] = await Promise.all([readFile(path), stat(path)]);
      status.present = true;
      status.bytes = raw.byteLength;
      const text = raw.toString('utf8');
      status.verdict = parseVerdictMarker(text);
      const currentPass = record.pass ?? 0;
      const explicitCurrent = currentPass >= 1 && status.verdict?.pass === currentPass;
      status.stale = explicitCurrent ? false : isArtifactStale(fileStat.mtimeMs, record.last_activity_at);
      status.valid = text.trim().length > 0 && !status.stale;
      status.preview = truncateBytes(text, OUTPUT_BUDGETS.artifactPreviewBytes);
    } catch (error) {
      if (!isNodeErrorWithCode(error, 'ENOENT')) throw error;
    }
    statuses.push(status);
  }
  return statuses;
}

async function persistRoleDecisions(statePath: string, observedState: RunState, snapshot: RunSnapshot): Promise<PersistRoleDecisionResult> {
  const decisions = snapshot.roles.map((role): RoleDecision => ({
    role: role.role,
    nextStatus: role.evaluated_status,
    observedStatus: observedState.roles[role.role]?.status ?? null,
    observedLastActivityAt: observedState.roles[role.role]?.last_activity_at ?? null,
    shouldPersist: role.evaluated_status === 'done' || role.evaluated_status === 'incomplete' || role.evaluated_status === 'blocked'
  }));
  if (!decisions.some((decision) => canApplyDecision(observedState, decision))) {
    return { state: observedState, transitions: [] };
  }
  const transitions: RoleTransition[] = [];
  const state = await updateRunState(statePath, (fresh) => {
    let changed = false;
    for (const decision of decisions) {
      if (!decision.shouldPersist) continue;
      const record = fresh.roles[decision.role];
      if (!record) continue;
      if (!isMutableStatus(record.status)) continue;
      if (record.status !== decision.observedStatus) continue;
      if (record.last_activity_at !== decision.observedLastActivityAt) continue;
      if (record.status === decision.nextStatus) continue;
      record.status = decision.nextStatus;
      transitions.push({ role: decision.role, status: decision.nextStatus });
      changed = true;
    }
    return changed;
  });
  return { state, transitions };
}

async function appendNotificationWarning(snapshot: RunSnapshot, runner: CommandRunner, state: RunState, transitions: RoleTransition[]): Promise<void> {
  if (!transitions.length) return;
  const summary = transitions.map((transition) => `${transition.role}: ${transition.status}`).join(', ');
  const sound = transitions.some((transition) => transition.status === 'blocked' || transition.status === 'incomplete') ? 'request' : 'done';
  try {
    const result = await notificationShow(runner, state.repo_root, {
      title: `pi-herd ${state.run_id}`,
      body: `Role status updates: ${summary}`,
      sound
    });
    if (result.exitCode !== 0) {
      snapshot.warnings.push(`Could not deliver lead notification: ${describeFailure(result, 'notification failed')}`);
    }
  } catch (error) {
    snapshot.warnings.push(`Could not deliver lead notification: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function collectPaneLogs(state: RunState, runner: CommandRunner): Promise<string[]> {
  const warnings: string[] = [];
  for (const record of roleEntries(state)) {
    if (!record.herdr_pane_id) continue;
    const result = await runner.run('herdr', ['pane', 'read', record.herdr_pane_id, '--source', 'recent', '--lines', String(OUTPUT_BUDGETS.paneReadLines), '--format', 'text'], { cwd: state.repo_root, timeoutMs: 10_000 });
    if (result.exitCode !== 0) {
      warnings.push(`${record.role}: could not collect pane log: ${describeFailure(result, 'pane read failed')}`);
      continue;
    }
    const logsDir = join(state.canonical_run_dir, 'logs');
    await mkdir(logsDir, { recursive: true });
    const path = join(logsDir, `${record.role}-${safeFilename(record.herdr_pane_id)}.log`);
    await writeTextAtomic(path, result.stdout);
  }
  return warnings;
}

function formatStatusText(snapshot: RunSnapshot): string {
  const lines = [
    `Run ${snapshot.run_id}`,
    `Goal: ${snapshot.goal}`,
    `Status: ${snapshot.status}`,
    `State revision: ${snapshot.state_revision ?? 'none'}`,
    'Roles:'
  ];
  for (const role of snapshot.roles) {
    const artifactSummary = role.artifacts.map((artifact) => `${artifact.valid ? 'valid' : artifact.stale ? 'stale' : artifact.present ? 'invalid' : 'missing'} ${artifact.name}`).join(', ');
    const passSummary = role.pass >= 1 ? `; pass=${role.pass}` : '';
    const verdictSummary = role.verdict ? `; verdict=${role.verdict.verdict}${role.verdict.summary ? ` (${role.verdict.summary})` : ''}` : '';
    lines.push(`- ${role.role}: stored=${role.stored_status}; evaluated=${role.evaluated_status}; signal=${role.signal}${passSummary}${verdictSummary}; artifacts=${artifactSummary || 'none'}`);
    for (const warning of role.warnings) {
      lines.push(`  Warning: ${warning}`);
    }
  }
  if (snapshot.final_summary_path) {
    lines.push(`Final summary: ${snapshot.final_summary_path}`);
  }
  if (snapshot.warnings.length) {
    lines.push('Warnings:', ...snapshot.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.slice(0, OUTPUT_BUDGETS.terminalSummaryLines).join('\n')}\n`;
}

function formatFinalSummary(snapshot: RunSnapshot): string {
  const lines = [
    '# FINAL_SUMMARY',
    '',
    `Run: ${snapshot.run_id}`,
    `Goal: ${snapshot.goal}`,
    `Run status: ${snapshot.status}`,
    `State revision: ${snapshot.state_revision ?? 'none'}`,
    `Generated: ${snapshot.generated_at}`,
    '',
    '## Role verdicts'
  ];
  for (const role of snapshot.roles) {
    const explicit = role.verdict ? `; explicit verdict: ${role.verdict.verdict} pass ${role.verdict.pass}${role.verdict.summary ? ` - ${role.verdict.summary}` : ''}` : '';
    lines.push(`- ${role.role}: ${role.stored_status} (signal: ${role.signal}${explicit})`);
  }
  lines.push('', '## Artifacts');
  for (const role of snapshot.roles) {
    for (const artifact of role.artifacts) {
      lines.push('', `### ${role.role}/${artifact.name}`, '', `Path: ${artifact.path}`, `Status: ${artifact.valid ? 'valid' : artifact.stale ? 'stale' : artifact.present ? 'invalid' : 'missing'}`, `Bytes: ${artifact.bytes}`);
      if (artifact.preview) {
        lines.push('', '```text', artifact.preview, '```');
      }
    }
  }
  if (snapshot.warnings.length) {
    lines.push('', '## Warnings', ...snapshot.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.join('\n')}\n`;
}

async function artifactOnlyWorktreeWarnings(runner: CommandRunner, record: RoleRecord): Promise<string[]> {
  if ((record.role !== 'reviewer' && record.role !== 'tester') || record.worktree_status !== 'materialized' || !record.worktree_path) {
    return [];
  }
  try {
    const dirty = await dirtyPaths(runner, record.worktree_path);
    if (!dirty.length) return [];
    return [`artifact-only worktree has source changes: ${formatBoundedItems(dirty)}`];
  } catch (error) {
    return [`could not check artifact-only worktree cleanliness: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function formatBoundedItems(items: string[]): string {
  const budget = OUTPUT_BUDGETS.terminalSummaryLines;
  if (items.length <= budget) return items.join(', ');
  return `${items.slice(0, budget).join(', ')}, ... truncated ${items.length - budget} item(s) ...`;
}

function isArtifactStale(mtimeMs: number, lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return false;
  const lastActivityMs = Date.parse(lastActivityAt);
  if (Number.isNaN(lastActivityMs)) return false;
  return mtimeMs < lastActivityMs;
}

function roleEntries(state: RunState): RoleRecord[] {
  return Object.values(state.roles).filter(Boolean) as RoleRecord[];
}

function canApplyDecision(state: RunState, decision: RoleDecision): boolean {
  const record = state.roles[decision.role];
  return Boolean(
    decision.shouldPersist &&
    record &&
    isMutableStatus(record.status) &&
    record.status === decision.observedStatus &&
    record.last_activity_at === decision.observedLastActivityAt &&
    record.status !== decision.nextStatus
  );
}

function hasUnresolvedOrNegativeVerdict(snapshot: RunSnapshot): boolean {
  return snapshot.roles.some((role) => ['incomplete', 'blocked', 'failed', 'working'].includes(role.stored_status));
}

function isWaitTarget(status: RoleStatus): boolean {
  return status === 'working' || status === 'blocked';
}

function isMutableStatus(status: RoleStatus): boolean {
  return status === 'working' || status === 'blocked';
}

function signalFromStoredStatus(status: RoleStatus): RoleSignal {
  if (status === 'done') return 'done';
  if (status === 'blocked') return 'blocked';
  if (status === 'working') return 'working';
  return 'unknown';
}


function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function truncateBytes(value: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes <= maxBytes) return value;
  const marker = `\n... truncated to ${maxBytes} bytes ...`;
  const prefixBudget = Math.max(0, maxBytes - Buffer.byteLength(marker, 'utf8'));
  let used = 0;
  let prefix = '';
  for (const codePoint of value) {
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    if (used + codePointBytes > prefixBudget) break;
    prefix += codePoint;
    used += codePointBytes;
  }
  return `${prefix}${marker}`;
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  const tempPath = join(dirname(path), `.tmp-${process.pid}-${Date.now()}-${randomUUID()}-${basename(path)}`);
  await writeFile(tempPath, value, { encoding: 'utf8', flag: 'wx' });
  await rename(tempPath, path);
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+$/, '_');
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
