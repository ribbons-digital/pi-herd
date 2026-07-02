import { join } from 'node:path';
import { createRun, writeJsonAtomic, type LaunchMetadata, type RoleRecord, type RunCreateOptions, type RunCreateResult, type RunState } from './run-state.js';
import { nodeCommandRunner, type CommandResult, type CommandRunner } from './command-runner.js';
import { ROLE_DEFAULTS, type BuiltInRole } from './defaults.js';
import type { HarnessProfile, PiHerdConfig, RoleStringMap } from './config.js';

const LAUNCH_TIMEOUT_MS = 30_000;
const PROMPT_TIMEOUT_MS = 10_000;

/** Options for creating a run and launching its initial visible Herdr/Pi sessions. */
export interface StartOptions extends Omit<RunCreateOptions, 'withWorktrees'> {
  env?: NodeJS.ProcessEnv;
}

/** Result for `pi-herd start`, including persisted run state and launched session refs. */
export interface StartResult extends RunCreateResult {
  launched: LaunchRef[];
}

/** A visible launch reference persisted or reported after a successful launch step. */
export interface LaunchRef {
  role: 'lead' | BuiltInRole;
  paneId: string | null;
  sessionRef: string | null;
  launchMethod: LaunchMetadata['launch_method'];
}

interface PiCommandSpec {
  command: string;
  args: string[];
  sessionId: string;
  metadata: LaunchMetadata;
}

export interface HerdrLaunchResult {
  workspaceId: string | null;
  tabId: string | null;
  paneId: string;
  sessionRef: string | null;
  launchMethod: 'herdr-agent-start' | 'herdr-pane-run' | 'bound-current-pane';
  metadata?: LaunchMetadata;
}

/** Create run artifacts, bind or create lead, launch planner, and stage selected workers. */
export async function startRun(options: StartOptions): Promise<StartResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const result = await createRun({ ...options, withWorktrees: startRequiresWorktrees(options), runner });
  const statePath = result.statePath;
  const state = result.state;
  const launched: LaunchRef[] = [];

  try {
    const lead = await bindOrLaunchLead(state, result.config, runner, options.env ?? process.env);
    state.lead_binding.herdr_workspace_id = lead.workspaceId;
    state.lead_binding.herdr_tab_id = lead.tabId;
    state.lead_binding.herdr_pane_id = lead.paneId;
    state.lead_binding.session_ref = lead.sessionRef;
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    launched.push({ role: 'lead', paneId: lead.paneId, sessionRef: lead.sessionRef, launchMethod: lead.launchMethod });

    if (state.roles.planner) {
      const planner = await launchRoleSession({ state, config: result.config, runner, role: 'planner', cwd: plannerCwd(state) });
      applyRoleLaunch(state.roles.planner, planner);
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      launched.push({ role: 'planner', paneId: planner.paneId, sessionRef: planner.sessionRef, launchMethod: planner.launchMethod });

      await sendPlannerKickoff(runner, planner.paneId, state);
      state.roles.planner.status = 'working';
      state.roles.planner.launch_metadata = { ...state.roles.planner.launch_metadata, prompt_method: 'pane-send-text-enter' };
      state.roles.planner.last_activity_at = new Date().toISOString();
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
    }

    if (state.roles.implementer) {
      if (!state.roles.implementer.worktree_path) {
        throw new Error('Implementer worktree was not materialized; cannot launch staged implementer session.');
      }
      const implementer = await launchRoleSession({ state, config: result.config, runner, role: 'implementer', cwd: state.roles.implementer.worktree_path });
      applyRoleLaunch(state.roles.implementer, implementer);
      state.roles.implementer.status = 'staged';
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      launched.push({ role: 'implementer', paneId: implementer.paneId, sessionRef: implementer.sessionRef, launchMethod: implementer.launchMethod });
    }

    for (const role of ['reviewer', 'tester'] as const) {
      const record = state.roles[role];
      if (record) {
        record.status = 'staged';
      }
    }
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    return { ...result, launched };
  } catch (error) {
    state.status = 'failed';
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    throw error;
  }
}

function startRequiresWorktrees(options: StartOptions): boolean {
  const selectedRoles = options.roles?.length ? options.roles : ['planner', 'implementer', 'reviewer', 'tester'];
  return selectedRoles.includes('implementer') || Boolean(options.plannerWorktree && selectedRoles.includes('planner'));
}

/** Format the human-readable result for `pi-herd start`. */
export function formatStartText(result: StartResult): string {
  const lines = [
    `Started run ${result.state.run_id}`,
    `Goal: ${result.state.goal}`,
    `Run directory: ${result.state.canonical_run_dir}`,
    `State: ${result.statePath}`
  ];
  for (const launch of result.launched) {
    lines.push(`${launch.role}: ${launch.paneId ?? 'no pane'} (${launch.launchMethod ?? 'unknown'})`);
  }
  return `${lines.join('\n')}\n`;
}

/** Build the Pi command and launch metadata for a lead or worker role. */
export function buildPiCommand(config: PiHerdConfig, role: 'lead' | BuiltInRole, state: RunState): PiCommandSpec {
  const profile = config.harness.profiles[config.harness.default];
  if (!profile) {
    throw new Error(`Harness profile '${config.harness.default}' is not configured.`);
  }
  const sessionId = `${state.run_id}-${role}`;
  const name = `pi-herd-${state.run_id}-${role}`;
  const args = [...(profile.args ?? []), '--name', name, '--session-id', sessionId];
  const provider = profile.provider ?? null;
  const model = role === 'lead' ? profile.model ?? null : modelForRole(profile, role);
  const thinking = role === 'lead' ? thinkingForRole(profile, undefined) : thinkingForRole(profile, role);
  if (provider) {
    args.push('--provider', provider);
  }
  if (model) {
    args.push('--model', model);
  }
  if (thinking) {
    args.push('--thinking', thinking);
  }
  return {
    command: profile.command,
    args,
    sessionId,
    metadata: {
      agent_name: name,
      command: profile.command,
      args: [...args],
      model,
      provider,
      thinking,
      expected_writes: role === 'lead' ? 'none' : ROLE_DEFAULTS[role].expectedWrites
    }
  };
}

async function bindOrLaunchLead(state: RunState, config: PiHerdConfig, runner: CommandRunner, env: NodeJS.ProcessEnv): Promise<HerdrLaunchResult> {
  if (env.HERDR_ENV === '1' && env.HERDR_PANE_ID && env.PI_CODING_AGENT === 'true') {
    const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
    if (verified) {
      return {
        workspaceId: verified.workspaceId ?? env.HERDR_WORKSPACE_ID ?? null,
        tabId: verified.tabId ?? env.HERDR_TAB_ID ?? null,
        paneId: env.HERDR_PANE_ID,
        sessionRef: null,
        launchMethod: 'bound-current-pane',
        metadata: { launch_method: 'bound-current-pane', expected_writes: 'none' }
      };
    }
  }

  const workspace = await createLeadWorkspace(runner, state);
  const launched = await launchHarnessInHerdr({ state, config, runner, role: 'lead', cwd: state.repo_root, workspaceId: workspace.workspaceId });
  return { ...launched, workspaceId: launched.workspaceId ?? workspace.workspaceId };
}

export async function launchRoleSession(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: BuiltInRole; cwd: string }): Promise<HerdrLaunchResult> {
  const leadWorkspace = options.state.lead_binding.herdr_workspace_id;
  if (!leadWorkspace) {
    throw new Error('Lead workspace is missing; cannot launch worker session.');
  }
  return launchHarnessInHerdr({ ...options, workspaceId: leadWorkspace });
}

async function launchHarnessInHerdr(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: 'lead' | BuiltInRole; cwd: string; workspaceId: string }): Promise<HerdrLaunchResult> {
  const spec = buildPiCommand(options.config, options.role, options.state);
  spec.metadata.cwd = options.cwd;
  const agent = await options.runner.run('herdr', [
    'agent', 'start', spec.metadata.agent_name ?? `pi-herd-${options.state.run_id}-${options.role}`,
    '--cwd', options.cwd,
    '--workspace', options.workspaceId,
    '--split', 'down',
    '--no-focus',
    '--', spec.command,
    ...spec.args
  ], { cwd: options.state.repo_root, timeoutMs: LAUNCH_TIMEOUT_MS });
  if (agent.exitCode === 0) {
    const parsed = parsePaneMetadata(agent.stdout);
    if (parsed.paneId) {
      return { workspaceId: parsed.workspaceId ?? options.workspaceId, tabId: parsed.tabId, paneId: parsed.paneId, sessionRef: spec.sessionId, launchMethod: 'herdr-agent-start', metadata: { ...spec.metadata, launch_method: 'herdr-agent-start' } };
    }
    throw new Error(`Could not launch ${options.role}. Herdr agent start returned unusable metadata.`);
  }
  if (agent.timedOut) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, 'agent start timed out')}.`);
  }

  const parentPaneId = options.state.lead_binding.herdr_pane_id;
  if (!parentPaneId) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, 'agent start failed')}. Pane fallback requires a lead pane.`);
  }
  const split = await options.runner.run('herdr', ['pane', 'split', parentPaneId, '--direction', 'down', '--cwd', options.cwd, '--no-focus'], { cwd: options.state.repo_root, timeoutMs: LAUNCH_TIMEOUT_MS });
  if (split.exitCode !== 0) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, 'agent start failed')}. Pane split: ${describeFailure(split, 'pane split failed')}`);
  }
  const pane = parsePaneMetadata(split.stdout).paneId;
  if (!pane) {
    throw new Error(`Could not launch ${options.role}. Herdr pane split returned unusable metadata.`);
  }
  const paneRun = await options.runner.run('herdr', ['pane', 'run', pane, spec.command, ...spec.args], { cwd: options.state.repo_root, timeoutMs: LAUNCH_TIMEOUT_MS });
  if (paneRun.exitCode !== 0) {
    throw new Error(`Could not launch ${options.role}. Pane run: ${describeFailure(paneRun, 'pane run failed')}`);
  }
  return { workspaceId: options.workspaceId, tabId: parsePaneMetadata(split.stdout).tabId, paneId: pane, sessionRef: spec.sessionId, launchMethod: 'herdr-pane-run', metadata: { ...spec.metadata, launch_method: 'herdr-pane-run' } };
}

export function applyRoleLaunch(record: RoleRecord, launch: HerdrLaunchResult): void {
  if (record.worktree_provider === 'herdr' && record.herdr_workspace_id && !record.worktree_herdr_workspace_id) {
    record.worktree_herdr_workspace_id = record.herdr_workspace_id;
  }
  record.herdr_workspace_id = launch.workspaceId;
  record.herdr_tab_id = launch.tabId;
  record.herdr_pane_id = launch.paneId;
  record.session_ref = launch.sessionRef;
  record.status = 'staged';
  record.launch_metadata = { ...(record.launch_metadata ?? {}), ...(launch.metadata ?? {}), launch_method: launch.launchMethod };
}

export async function verifyCurrentPane(runner: CommandRunner, cwd: string, paneId: string): Promise<{ workspaceId: string | null; tabId: string | null } | null> {
  const current = await runner.run('herdr', ['pane', 'current', '--current'], { cwd, timeoutMs: LAUNCH_TIMEOUT_MS });
  if (current.exitCode === 0) {
    const metadata = parsePaneMetadata(current.stdout);
    if (metadata.paneId === paneId) {
      return { workspaceId: metadata.workspaceId, tabId: metadata.tabId };
    }
  }
  const pane = await runner.run('herdr', ['pane', 'get', paneId], { cwd, timeoutMs: LAUNCH_TIMEOUT_MS });
  if (pane.exitCode === 0) {
    const metadata = parsePaneMetadata(pane.stdout);
    if (metadata.paneId === paneId) {
      return { workspaceId: metadata.workspaceId, tabId: metadata.tabId };
    }
  }
  return null;
}

async function createLeadWorkspace(runner: CommandRunner, state: RunState): Promise<{ workspaceId: string }> {
  const result = await runner.run('herdr', ['workspace', 'create', '--cwd', state.repo_root, '--label', `pi-herd ${state.run_slug} lead`, '--no-focus'], { cwd: state.repo_root, timeoutMs: LAUNCH_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`Could not create lead workspace: ${describeFailure(result, 'herdr workspace create failed')}`);
  }
  const workspaceId = parsePaneMetadata(result.stdout).workspaceId ?? stringFromJson(result.stdout, ['workspace_id', 'workspaceId', 'id']) ?? firstToken(result.stdout);
  if (!workspaceId) {
    throw new Error('Could not create lead workspace. Herdr returned unusable metadata.');
  }
  return { workspaceId };
}

async function sendPlannerKickoff(runner: CommandRunner, paneId: string, state: RunState): Promise<void> {
  const prompt = `You are the planner for pi-herd run ${state.run_id}.\nGoal: ${state.goal}\nWrite your plan to ${join(state.canonical_run_dir, 'PLAN.md')}.\nDo not edit source files unless explicitly instructed by the lead.`;
  try {
    await sendToPane(runner, state.repo_root, paneId, prompt);
  } catch (error) {
    state.roles.planner!.status = 'failed';
    throw error;
  }
}

export async function sendToPane(runner: CommandRunner, cwd: string, paneId: string, message: string): Promise<void> {
  const text = await runner.run('herdr', ['pane', 'send-text', paneId, message], { cwd, timeoutMs: PROMPT_TIMEOUT_MS });
  if (text.exitCode !== 0) {
    throw new Error(`Could not send pane text: ${describeFailure(text, 'pane send-text failed')}`);
  }
  const enter = await runner.run('herdr', ['pane', 'send-keys', paneId, 'enter'], { cwd, timeoutMs: PROMPT_TIMEOUT_MS });
  if (enter.exitCode !== 0) {
    throw new Error(`Could not submit pane text: ${describeFailure(enter, 'pane send-keys failed')}`);
  }
}

function plannerCwd(state: RunState): string {
  return state.roles.planner?.worktree_path ?? state.repo_root;
}

function modelForRole(profile: HarnessProfile, role: BuiltInRole): string | null {
  return profile.models?.[role] ?? profile.model ?? null;
}

function thinkingForRole(profile: HarnessProfile, role?: BuiltInRole): string | null {
  if (typeof profile.thinking === 'string') {
    return profile.thinking;
  }
  if (role && isRoleMap(profile.thinking)) {
    return profile.thinking[role] ?? null;
  }
  return null;
}

function isRoleMap(value: HarnessProfile['thinking']): value is RoleStringMap {
  return Boolean(value && typeof value === 'object');
}

function parsePaneMetadata(stdout: string): { paneId: string | null; workspaceId: string | null; tabId: string | null } {
  const parsed = parseJsonRecord(stdout);
  const records = metadataContainers(parsed);
  return {
    paneId: explicitPaneIdFromRecords(records),
    workspaceId: stringFromRecords(records, ['workspace_id', 'workspaceId', 'herdr_workspace_id']),
    tabId: stringFromRecords(records, ['tab_id', 'tabId', 'herdr_tab_id'])
  };
}

function stringFromJson(stdout: string, keys: string[]): string | null {
  return stringFromRecords(metadataContainers(parseJsonRecord(stdout)), keys);
}

function parseJsonRecord(stdout: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return Object.create(null) as Record<string, unknown>;
  }
  return Object.create(null) as Record<string, unknown>;
}

function metadataContainers(value: Record<string, unknown>): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [];
  const queue = [value];
  while (queue.length) {
    const container = queue.shift();
    if (!container) continue;
    containers.push(container);
    for (const key of ['result', 'data', 'pane', 'agent', 'workspace', 'terminal']) {
      const child = container[key];
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        queue.push(child as Record<string, unknown>);
      }
    }
  }
  return containers;
}

function explicitPaneIdFromRecords(records: Record<string, unknown>[]): string | null {
  return stringFromRecords(records, ['pane_id', 'paneId', 'herdr_pane_id']) ?? stringFromPaneContainers(records);
}

function stringFromPaneContainers(records: Record<string, unknown>[]): string | null {
  for (const record of records) {
    for (const key of ['pane', 'terminal']) {
      const child = record[key];
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        const id = (child as Record<string, unknown>).id;
        if (typeof id === 'string' && id.length > 0) {
          return id;
        }
      }
    }
  }
  return null;
}

function stringFromRecords(records: Record<string, unknown>[], keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function describeFailure(result: CommandResult, fallback: string): string {
  if (result.error) {
    return result.error.code ? `${result.error.code}: ${result.error.message}` : result.error.message;
  }
  if (result.timedOut) {
    return `${fallback} timed out`;
  }
  return firstLine(result.stderr) || firstLine(result.stdout) || fallback;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function firstToken(value: string): string | null {
  return firstLine(value)?.split(/\s+/)[0] ?? null;
}
