import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, relative } from 'node:path';
import { type PiHerdConfig } from './config.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { DEFAULT_RUNS_DIR, ROLE_DEFAULTS, type BuiltInRole } from './defaults.js';
import { applyRoleLaunch, launchRoleSession, sendToPane, verifyCurrentPane, waitForRoleReady } from './start.js';
import { describeFailure, paneGet } from './herdr.js';
import { materializeRoleWorktree } from './worktree.js';
import { loadConfigIfPresent, resolveRunContext, resolveRunsRoot, updateRunState, type RoleRecord, type RunState } from './run-state.js';

/** Shared options for commands that resolve and read a pi-herd run. */
export interface RunCommandOptions {
  cwd: string;
  configPath?: string;
  run?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
}

/** Options for sending a prompt to a selected role pane. */
export interface SendOptions extends RunCommandOptions {
  role: BuiltInRole;
  message: string;
  requireLead?: boolean;
}

/** Human-readable command output paired with the run state used to produce it. */
export interface CommandResultText {
  state: RunState;
  text: string;
}

/** Send a prompt to a role, validating saved panes and activating or relaunching roles when needed. */
export async function sendMessage(options: SendOptions): Promise<CommandResultText> {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunState(options, runner);
  const state = resolved.state;
  const record = state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for run ${state.run_id}.`);
  }
  if (options.requireLead) {
    await assertCurrentLead(state, runner, options.env ?? process.env);
  }
  const config = await loadConfigIfPresent(options.configPath ? options.cwd : state.repo_root, options.configPath);
  const activation = await ensureRolePane({ state, statePath: resolved.statePath, config, runner, role: options.role });
  const paneId = record.herdr_pane_id;
  if (!paneId) {
    throw new Error(`Role ${options.role} has no pane after activation.`);
  }
  if (activation.launchedNow) {
    const readyWarning = await waitForRoleReady(runner, state.repo_root, paneId, options.role);
    if (readyWarning) {
      activation.notes.push(readyWarning);
    }
  }
  await sendToPane(runner, state.repo_root, paneId, options.message);
  const updated = await updateRunState(resolved.statePath, (fresh) => {
    const freshRecord = fresh.roles[options.role];
    if (!freshRecord) return;
    freshRecord.status = 'working';
    freshRecord.last_activity_at = new Date().toISOString();
    freshRecord.herdr_workspace_id = record.herdr_workspace_id;
    freshRecord.herdr_tab_id = record.herdr_tab_id;
    freshRecord.herdr_pane_id = record.herdr_pane_id;
    freshRecord.session_ref = record.session_ref;
    freshRecord.launch_metadata = record.launch_metadata;
    freshRecord.worktree_path = record.worktree_path;
    freshRecord.worktree_status = record.worktree_status;
    freshRecord.worktree_provider = record.worktree_provider;
    freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
  });
  const warnings = capabilityWarnings(record);
  return {
    state: updated,
    text: [`Sent message to ${options.role} (${paneId}).`, ...activation.notes, ...warnings.map((warning) => `Warning: ${warning}`)].join('\n') + '\n'
  };
}

/** Print bounded state for the active or selected run without changing worker completion. */
export async function leadStatus(options: RunCommandOptions): Promise<CommandResultText> {
  const runner = options.runner ?? nodeCommandRunner;
  const { state } = await resolveRunState(options, runner);
  const lines = [
    `Run ${state.run_id}`,
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    `Lead pane: ${state.lead_binding.herdr_pane_id ?? 'none'}`,
    'Roles:'
  ];
  for (const role of roleEntries(state)) {
    lines.push(`- ${role.role}: ${role.status}; pane=${role.herdr_pane_id ?? 'none'}; worktree=${role.worktree_status}; session=${role.session_ref ?? 'none'}`);
  }
  return { state, text: `${lines.join('\n')}\n` };
}

/** Print a bounded lead-session brief from state, expected artifacts, and inbox inventory. */
export async function leadBrief(options: RunCommandOptions): Promise<CommandResultText> {
  const runner = options.runner ?? nodeCommandRunner;
  const { state } = await resolveRunState(options, runner);
  const artifacts = await artifactInventory(state);
  const inbox = await inboxInventory(state);
  const warnings = roleEntries(state).flatMap(capabilityWarnings);
  const lines = [
    `# pi-herd brief`,
    `Run: ${state.run_id}`,
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    '',
    '## Roles',
    ...roleEntries(state).map((role) => `- ${role.role}: ${role.status}; pane=${role.herdr_pane_id ?? 'none'}; worktree=${role.worktree_status}`),
    '',
    '## Artifacts',
    ...artifacts.map((artifact) => `- ${artifact.present ? 'present' : 'missing'} ${artifact.role}/${artifact.name}: ${artifact.path}`),
    '',
    '## Inbox',
    ...(inbox.length ? inbox.map((item) => `- ${item}`) : ['- none']),
    ...(warnings.length ? ['', '## Warnings', ...warnings.map((warning) => `- ${warning}`)] : []),
    '',
    'Next: send work to a staged role or wait for active workers; completion checks arrive in a later slice.'
  ];
  return { state, text: `${truncate(lines.join('\n'), 8000)}\n` };
}

/** Print a read-only artifact and inbox inventory for the active or selected run. */
export async function leadCollect(options: RunCommandOptions): Promise<CommandResultText> {
  const runner = options.runner ?? nodeCommandRunner;
  const { state } = await resolveRunState(options, runner);
  const artifacts = await artifactInventory(state);
  const inbox = await inboxInventory(state);
  const lines = [
    `Artifact inventory for ${state.run_id}`,
    ...artifacts.map((artifact) => `- ${artifact.present ? 'present' : 'missing'} ${artifact.role}/${artifact.name}: ${artifact.path}`),
    'Inbox:',
    ...(inbox.length ? inbox.map((item) => `- ${item}`) : ['- none'])
  ];
  return { state, text: `${lines.join('\n')}\n` };
}

async function ensureRolePane(options: { state: RunState; statePath: string; config: PiHerdConfig; runner: CommandRunner; role: BuiltInRole }): Promise<{ notes: string[]; launchedNow: boolean }> {
  const record = options.state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for this run.`);
  }
  const notes: string[] = [];
  let launchedNow = false;
  let stalePane = false;
  if (record.herdr_pane_id) {
    const pane = await paneGet(options.runner, options.state.repo_root, record.herdr_pane_id);
    if (pane.exitCode !== 0) {
      if (pane.timedOut || pane.error || !isMissingPaneFailure(pane)) {
        throw new Error(`Could not validate ${options.role} pane ${record.herdr_pane_id}: ${describeFailure(pane, 'pane get failed')}`);
      }
      notes.push(`Detected stale pane for ${options.role}; relaunching.`);
      stalePane = true;
    }
  }
  if ((options.role === 'reviewer' || options.role === 'tester') && record.worktree_status !== 'materialized') {
    notes.push(`Activating ${options.role}: materializing worktree from ${record.source_ref ?? options.state.base_ref}.`);
    await materializeRoleWorktree({
      state: options.state,
      runner: options.runner,
      role: options.role,
      baseRef: record.source_ref,
      cleanCheckIgnorePaths: [relative(options.state.repo_root, resolveRunsRoot(options.state.repo_root, options.config.paths.runs_dir || DEFAULT_RUNS_DIR)), '.worktrees'],
      onMaterialized: async () => {
        await updateRunState(options.statePath, (fresh) => {
          const freshRecord = fresh.roles[options.role];
          if (!freshRecord) return;
          freshRecord.worktree_path = record.worktree_path;
          freshRecord.worktree_status = record.worktree_status;
          freshRecord.worktree_provider = record.worktree_provider;
          freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
          freshRecord.herdr_workspace_id = record.herdr_workspace_id;
        });
      }
    });
  }
  if (!record.herdr_pane_id || stalePane) {
    if (!record.worktree_path && ROLE_DEFAULTS[options.role].expectedWrites === 'worktree') {
      throw new Error(`Role ${options.role} needs a worktree before launch.`);
    }
    notes.push(`Activating ${options.role}: launching session.`);
    const launch = await launchRoleSession({
      state: options.state,
      config: options.config,
      runner: options.runner,
      role: options.role,
      cwd: record.worktree_path ?? options.state.repo_root
    });
    applyRoleLaunch(record, launch);
    launchedNow = true;
    await updateRunState(options.statePath, (fresh) => {
      const freshRecord = fresh.roles[options.role];
      if (!freshRecord) return;
      freshRecord.herdr_workspace_id = record.herdr_workspace_id;
      freshRecord.herdr_tab_id = record.herdr_tab_id;
      freshRecord.herdr_pane_id = record.herdr_pane_id;
      freshRecord.session_ref = record.session_ref;
      freshRecord.status = record.status;
      freshRecord.launch_metadata = record.launch_metadata;
      freshRecord.worktree_path = record.worktree_path;
      freshRecord.worktree_status = record.worktree_status;
      freshRecord.worktree_provider = record.worktree_provider;
      freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
    });
  }
  return { notes, launchedNow };
}

function isMissingPaneFailure(result: Awaited<ReturnType<typeof paneGet>>): boolean {
  const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (/\b(unknown command|unknown flag|unrecognized|unsupported)\b/.test(output)) {
    return false;
  }
  return [
    /\bmissing\s+pane\b/,
    /\bpane\s+[^\n]*\b(missing|not found|does not exist)\b/,
    /\b(no such|not found)\s+[^\n]*\bpane\b/
  ].some((pattern) => pattern.test(output));
}

async function resolveRunState(options: RunCommandOptions, runner: CommandRunner): Promise<{ state: RunState; statePath: string }> {
  return resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, env: options.env, runner });
}

function hasCurrentPaneEnv(env: NodeJS.ProcessEnv): env is NodeJS.ProcessEnv & { HERDR_PANE_ID: string } {
  return env.HERDR_ENV === '1' && Boolean(env.HERDR_PANE_ID) && env.PI_CODING_AGENT === 'true';
}

async function assertCurrentLead(state: RunState, runner: CommandRunner, env: NodeJS.ProcessEnv): Promise<void> {
  if (!hasCurrentPaneEnv(env)) {
    throw new Error('Lead command must run from the bound Pi lead pane.');
  }
  const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
  if (!verified || state.lead_binding.herdr_pane_id !== env.HERDR_PANE_ID) {
    throw new Error('Lead command must run from the bound Pi lead pane for this run.');
  }
}

function roleEntries(state: RunState): RoleRecord[] {
  return Object.values(state.roles).filter(Boolean) as RoleRecord[];
}

function capabilityWarnings(record: RoleRecord): string[] {
  const warnings: string[] = [];
  if (!record.herdr_pane_id && record.status !== 'pending') {
    warnings.push(`${record.role} has no pane/session.`);
  }
  if (ROLE_DEFAULTS[record.role].expectedWrites === 'worktree' && !record.worktree_path) {
    warnings.push(`${record.role} expects worktree writes but has no worktree path.`);
  }
  if (record.worktree_status === 'pending' && (record.role === 'reviewer' || record.role === 'tester')) {
    warnings.push(`${record.role} worktree is pending until first activation.`);
  }
  return warnings;
}

async function artifactInventory(state: RunState): Promise<Array<{ role: BuiltInRole; name: string; path: string; present: boolean }>> {
  const artifacts = [];
  for (const role of roleEntries(state)) {
    for (const name of role.required_artifacts) {
      const path = join(state.canonical_run_dir, name);
      artifacts.push({ role: role.role, name, path, present: await exists(path) });
    }
  }
  return artifacts;
}

async function inboxInventory(state: RunState): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises');
    return (await readdir(join(state.canonical_run_dir, 'inbox'))).sort().slice(0, 20);
  } catch {
    return [];
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n... truncated ...` : value;
}
