import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { type PiHerdConfig } from './config.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { DEFAULT_RUNS_DIR, DEFAULT_WORKTREES_DIR, ROLE_DEFAULTS, type BuiltInRole } from './defaults.js';
import { applyRoleLaunch, launchRoleSession, sendToPane, verifyCurrentPane } from './start.js';
import { materializeRoleWorktree } from './worktree.js';
import { listActiveRuns, loadConfigIfPresent, readRunState, resolveRunsRoot, writeJsonAtomic, type ActiveRunSummary, type RoleRecord, type RunState } from './run-state.js';

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

/** Send a prompt to a role, activating reviewer or tester first when needed. */
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
  await sendToPane(runner, state.repo_root, paneId, options.message);
  record.status = 'working';
  record.last_activity_at = new Date().toISOString();
  state.updated_at = new Date().toISOString();
  await writeJsonAtomic(resolved.statePath, state);
  const warnings = capabilityWarnings(record);
  return {
    state,
    text: [`Sent message to ${options.role} (${paneId}).`, ...activation, ...warnings.map((warning) => `Warning: ${warning}`)].join('\n') + '\n'
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

async function ensureRolePane(options: { state: RunState; statePath: string; config: PiHerdConfig; runner: CommandRunner; role: BuiltInRole }): Promise<string[]> {
  const record = options.state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for this run.`);
  }
  const notes: string[] = [];
  if ((options.role === 'reviewer' || options.role === 'tester') && record.worktree_status !== 'materialized') {
    notes.push(`Activating ${options.role}: materializing worktree from ${record.source_ref ?? options.state.base_ref}.`);
    await materializeRoleWorktree({
      state: options.state,
      runner: options.runner,
      role: options.role,
      baseRef: record.source_ref,
      cleanCheckIgnorePaths: [relative(options.state.repo_root, resolveRunsRoot(options.state.repo_root, options.config.paths.runs_dir || DEFAULT_RUNS_DIR)), '.worktrees'],
      onMaterialized: async () => {
        options.state.updated_at = new Date().toISOString();
        await writeJsonAtomic(options.statePath, options.state);
      }
    });
  }
  if (!record.herdr_pane_id) {
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
    options.state.updated_at = new Date().toISOString();
    await writeJsonAtomic(options.statePath, options.state);
  }
  return notes;
}

async function resolveRunState(options: RunCommandOptions, runner: CommandRunner): Promise<{ state: RunState; statePath: string }> {
  const paneMatch = options.run ? null : await resolveByCurrentPane(options, runner);
  const summary = paneMatch ?? await listRunsForInvocation(options, runner).then((runs) => selectRun(runs, options.run));
  if (!summary) {
    throw new Error('No active runs found.');
  }
  const statePath = join(summary.canonical_run_dir, 'state.json');
  return { state: await readRunState(statePath), statePath };
}

async function resolveByCurrentPane(options: RunCommandOptions, runner: CommandRunner) {
  const env = options.env ?? process.env;
  if (env.HERDR_ENV !== '1' || !env.HERDR_PANE_ID || env.PI_CODING_AGENT !== 'true') {
    return null;
  }
  const runs = await listRunsForInvocation(options, runner);
  const matches = [];
  for (const run of runs) {
    const state = await readRunState(join(run.canonical_run_dir, 'state.json'));
    const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
    if (!verified) {
      continue;
    }
    if (state.lead_binding.herdr_pane_id === env.HERDR_PANE_ID || roleEntries(state).some((role) => role.herdr_pane_id === env.HERDR_PANE_ID)) {
      matches.push(run);
    }
  }
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Current pane matches multiple active runs. Pass --run <run_id|slug>.`);
  }
  return null;
}

function selectRun(runs: Awaited<ReturnType<typeof listActiveRuns>>, selector?: string) {
  if (selector) {
    if (selector === 'latest') {
      const latest = runs.at(-1);
      if (!latest) throw new Error('No active runs found.');
      return latest;
    }
    const matches = runs.filter((run) => run.run_id === selector || run.run_slug === selector);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Run selector '${selector}' is ambiguous. Pass a run_id.`);
    throw new Error(`No active run matched '${selector}'.`);
  }
  if (runs.length === 1) return runs[0];
  if (!runs.length) throw new Error('No active runs found.');
  throw new Error('Multiple active runs found. Pass --run <run_id|slug>.');
}

async function assertCurrentLead(state: RunState, runner: CommandRunner, env: NodeJS.ProcessEnv): Promise<void> {
  if (env.HERDR_ENV !== '1' || !env.HERDR_PANE_ID || env.PI_CODING_AGENT !== 'true') {
    throw new Error('Lead command must run from the bound Pi lead pane.');
  }
  const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
  if (!verified || state.lead_binding.herdr_pane_id !== env.HERDR_PANE_ID) {
    throw new Error('Lead command must run from the bound Pi lead pane for this run.');
  }
}

async function listRunsForInvocation(options: RunCommandOptions, runner: CommandRunner) {
  const seen = new Set<string>();
  const runs: ActiveRunSummary[] = [];
  for (const cwd of invocationRunSearchCwds(options.cwd)) {
    let active;
    try {
      active = await listActiveRuns(cwd, options.configPath, runner);
    } catch (error) {
      if (cwd === options.cwd && options.configPath) {
        throw error;
      }
      continue;
    }
    for (const run of active) {
      if (!seen.has(run.canonical_run_dir)) {
        seen.add(run.canonical_run_dir);
        runs.push(run);
      }
    }
  }
  return runs.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function invocationRunSearchCwds(cwd: string): string[] {
  const candidates = [cwd];
  const canonicalRoot = inferCanonicalRootFromWorktree(cwd);
  if (canonicalRoot) {
    candidates.push(canonicalRoot);
  }
  return candidates;
}

function inferCanonicalRootFromWorktree(cwd: string): string | null {
  const absolute = resolve(cwd);
  const parts = absolute.split(sep);
  const markerParts = DEFAULT_WORKTREES_DIR.split(/[\\/]+/).filter(Boolean);
  for (let markerIndex = parts.length - markerParts.length; markerIndex > 0; markerIndex -= 1) {
    if (!markerParts.every((part, offset) => parts[markerIndex + offset] === part)) {
      continue;
    }
    const piHerdIndex = markerIndex + markerParts.length;
    if (parts[piHerdIndex] !== 'pi-herd' || parts.length < piHerdIndex + 3) {
      continue;
    }
    const root = parts.slice(0, markerIndex).join(sep) || sep;
    if (!root || root === absolute || !isAbsolute(root)) {
      return null;
    }
    return root;
  }
  return null;
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
    return (await readdir(join(state.canonical_run_dir, 'inbox'))).slice(0, 20);
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
