import type { CommandResult, CommandRunner } from './command-runner.js';
import type { HarnessProfile, PiHerdConfig, RoleStringMap } from './config.js';
import type { RoleName } from './defaults.js';
import {
  agentStart,
  describeFailure,
  firstLine,
  HERDR_DELIVERY_ACK_TIMEOUT_MS,
  paneGet,
  paneRun as runInPane,
  paneSendEnter,
  paneSendEscape,
  paneSendText,
  paneSplit,
  parseAgentStatus,
  parsePaneMetadata,
  verifyCurrentPane as verifyCurrentHerdrPane,
  waitAgentStatus,
  workspaceCreate
} from './herdr.js';
import type { LaunchMetadata, RoleRecord, RunState } from './run-state.js';

export type HarnessRoleSignal = 'idle' | 'working' | 'blocked' | 'done' | 'stopped' | 'unknown' | 'not-launched';
export type PaneValidationStatus = 'ok' | 'missing' | 'unknown';

export interface PaneDelivery {
  verification: 'verified' | 'ambiguous' | 'unverified';
  note: string | null;
}

export interface PaneValidation {
  status: PaneValidationStatus;
  result: CommandResult;
}

export interface RoleSignalResult {
  signal: HarnessRoleSignal;
  warnings: string[];
}

export interface PiCommandSpec {
  command: string;
  args: string[];
  sessionId: string;
  metadata: LaunchMetadata;
}

export interface HarnessLaunchResult {
  workspaceId: string | null;
  tabId: string | null;
  paneId: string;
  sessionRef: string | null;
  launchMethod: 'herdr-agent-start' | 'herdr-pane-run' | 'bound-current-pane';
  metadata?: LaunchMetadata;
}

export interface HarnessAdapter {
  verifyCurrentPane(runner: CommandRunner, cwd: string, paneId: string): Promise<{ workspaceId: string | null; tabId: string | null } | null>;
  bindOrLaunchLead(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; env: NodeJS.ProcessEnv }): Promise<HarnessLaunchResult>;
  launchRoleSession(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: RoleName; cwd: string }): Promise<HarnessLaunchResult>;
  sendToPane(runner: CommandRunner, cwd: string, paneId: string, message: string): Promise<PaneDelivery>;
  waitForRoleReady(runner: CommandRunner, cwd: string, paneId: string, role: string): Promise<string | null>;
  validatePane(runner: CommandRunner, cwd: string, paneId: string): Promise<PaneValidation>;
  interruptPane(runner: CommandRunner, cwd: string, paneId: string): Promise<CommandResult>;
  readRoleSignal(options: { runner: CommandRunner; state: RunState; record: RoleRecord; timeoutMs: number }): Promise<RoleSignalResult>;
}

export function createHarnessAdapter(): HarnessAdapter {
  return PI_HERDR_HARNESS_ADAPTER;
}

export const PI_HERDR_HARNESS_ADAPTER: HarnessAdapter = {
  verifyCurrentPane: verifyCurrentHerdrPane,
  bindOrLaunchLead,
  launchRoleSession,
  sendToPane,
  waitForRoleReady,
  validatePane,
  interruptPane: paneSendEscape,
  readRoleSignal
};

/** Build the Pi command and launch metadata for a lead or worker role. */
export function buildPiCommand(config: PiHerdConfig, role: 'lead' | RoleName, state: RunState): PiCommandSpec {
  const profile = config.harness.profiles[config.harness.default];
  if (!profile) {
    throw new Error(`Harness profile '${config.harness.default}' is not configured.`);
  }
  const record = role === 'lead' ? null : state.roles[role];
  const definition = role === 'lead' ? null : config.roles.definitions[role];
  if (role !== 'lead' && !record && !definition) {
    throw new Error(`Role ${role} is not defined in config roles.definitions.`);
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
      expected_writes: record?.expected_writes ?? definition?.expected_writes ?? 'none'
    }
  };
}

async function bindOrLaunchLead(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; env: NodeJS.ProcessEnv }): Promise<HarnessLaunchResult> {
  if (options.env.HERDR_ENV === '1' && options.env.HERDR_PANE_ID && options.env.PI_CODING_AGENT === 'true') {
    const verified = await verifyCurrentHerdrPane(options.runner, options.state.repo_root, options.env.HERDR_PANE_ID);
    if (verified) {
      return {
        workspaceId: verified.workspaceId ?? options.env.HERDR_WORKSPACE_ID ?? null,
        tabId: verified.tabId ?? options.env.HERDR_TAB_ID ?? null,
        paneId: options.env.HERDR_PANE_ID,
        sessionRef: null,
        launchMethod: 'bound-current-pane',
        metadata: { launch_method: 'bound-current-pane', expected_writes: 'none' }
      };
    }
  }

  const workspace = await createLeadWorkspace(options.runner, options.state);
  const launched = await launchHarnessInHerdr({ state: options.state, config: options.config, runner: options.runner, role: 'lead', cwd: options.state.repo_root, workspaceId: workspace.workspaceId });
  return { ...launched, workspaceId: launched.workspaceId ?? workspace.workspaceId };
}

/** Launch a worker role session inside the bound lead workspace. */
export async function launchRoleSession(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: RoleName; cwd: string }): Promise<HarnessLaunchResult> {
  const leadWorkspace = options.state.lead_binding.herdr_workspace_id;
  if (!leadWorkspace) {
    throw new Error('Lead workspace is missing; cannot launch worker session.');
  }
  return launchHarnessInHerdr({ ...options, workspaceId: leadWorkspace });
}

async function launchHarnessInHerdr(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: 'lead' | RoleName; cwd: string; workspaceId: string }): Promise<HarnessLaunchResult> {
  const spec = buildPiCommand(options.config, options.role, options.state);
  spec.metadata.cwd = options.cwd;
  const agent = await agentStart(options.runner, options.state.repo_root, {
    name: spec.metadata.agent_name ?? `pi-herd-${options.state.run_id}-${options.role}`,
    sessionCwd: options.cwd,
    workspaceId: options.workspaceId,
    command: spec.command,
    args: spec.args
  });
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
  const split = await paneSplit(options.runner, options.state.repo_root, { parentPaneId, sessionCwd: options.cwd });
  if (split.exitCode !== 0) {
    throw new Error(`Could not launch ${options.role}. Herdr: ${describeFailure(agent, 'agent start failed')}. Pane split: ${describeFailure(split, 'pane split failed')}`);
  }
  const pane = parsePaneMetadata(split.stdout).paneId;
  if (!pane) {
    throw new Error(`Could not launch ${options.role}. Herdr pane split returned unusable metadata.`);
  }
  const paneRun = await runInPane(options.runner, options.state.repo_root, pane, spec.command, spec.args);
  if (paneRun.exitCode !== 0) {
    throw new Error(`Could not launch ${options.role}. Pane run: ${describeFailure(paneRun, 'pane run failed')}`);
  }
  return { workspaceId: options.workspaceId, tabId: parsePaneMetadata(split.stdout).tabId, paneId: pane, sessionRef: spec.sessionId, launchMethod: 'herdr-pane-run', metadata: { ...spec.metadata, launch_method: 'herdr-pane-run' } };
}

/** Persist launch refs and additive metadata onto a role record. */
export function applyRoleLaunch(record: RoleRecord, launch: HarnessLaunchResult): void {
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

/** Verify that the current Herdr pane matches an expected pane id. */
export const verifyCurrentPane = verifyCurrentHerdrPane;

async function createLeadWorkspace(runner: CommandRunner, state: RunState): Promise<{ workspaceId: string }> {
  const result = await workspaceCreate(runner, state.repo_root, { repoRoot: state.repo_root, label: `pi-herd ${state.run_slug} lead` });
  if (result.exitCode !== 0) {
    throw new Error(`Could not create lead workspace: ${describeFailure(result, 'herdr workspace create failed')}`);
  }
  const workspaceId = parsePaneMetadata(result.stdout).workspaceId ?? workspaceIdFromJson(result.stdout) ?? firstToken(result.stdout);
  if (!workspaceId) {
    throw new Error('Could not create lead workspace. Herdr returned unusable metadata.');
  }
  return { workspaceId };
}

/** Submit text to a Herdr pane as one send-text payload followed by Enter, then verify delivery. */
export async function sendToPane(runner: CommandRunner, cwd: string, paneId: string, message: string): Promise<PaneDelivery> {
  const before = await paneGet(runner, cwd, paneId);
  const preStatus = before.exitCode === 0 ? parseAgentStatus(before.stdout) : null;
  const text = await paneSendText(runner, cwd, paneId, message);
  if (text.exitCode !== 0) {
    throw new Error(`Could not send pane text: ${describeFailure(text, 'pane send-text failed')}`);
  }
  const enter = await paneSendEnter(runner, cwd, paneId);
  if (enter.exitCode !== 0) {
    throw new Error(`Could not submit pane text after text was inserted; pane may contain unsubmitted text and retry may duplicate it: ${describeFailure(enter, 'pane send-keys failed')}`);
  }
  if (preStatus === 'working') {
    return { verification: 'ambiguous', note: `pane ${paneId} was already working before the prompt was submitted, so delivery could not be independently verified.` };
  }
  const provenNonWorking = preStatus === 'idle' || preStatus === 'blocked' || preStatus === 'done';
  const ack = await waitAgentStatus(runner, cwd, paneId, 'working', HERDR_DELIVERY_ACK_TIMEOUT_MS);
  if (ack.exitCode === 0) {
    if (provenNonWorking) {
      return { verification: 'verified', note: null };
    }
    return { verification: 'ambiguous', note: `pane ${paneId} reported working after submit, but its pre-send agent status was unknown, so the transition could not be proven.` };
  }
  return { verification: 'unverified', note: `pane ${paneId} did not report working within ${HERDR_DELIVERY_ACK_TIMEOUT_MS / 1000}s after submit; inspect the pane before re-sending because a retry may duplicate the prompt.` };
}

export async function waitForRoleReady(runner: CommandRunner, cwd: string, paneId: string, role: string): Promise<string | null> {
  const result = await waitAgentStatus(runner, cwd, paneId, 'idle');
  if (result.exitCode === 0) {
    return null;
  }
  return `${role} pane did not report idle before first prompt; sent anyway (${describeFailure(result, 'wait agent-status idle failed')}).`;
}

export async function validatePane(runner: CommandRunner, cwd: string, paneId: string): Promise<PaneValidation> {
  const result = await paneGet(runner, cwd, paneId);
  if (result.exitCode === 0) {
    return { status: 'ok', result };
  }
  const missing = !result.timedOut && !result.error && isMissingPaneFailure(result);
  return { status: missing ? 'missing' : 'unknown', result };
}

async function readRoleSignal(options: { runner: CommandRunner; state: RunState; record: RoleRecord; timeoutMs: number }): Promise<RoleSignalResult> {
  const paneId = options.record.herdr_pane_id;
  if (!paneId) {
    return { signal: 'not-launched', warnings: [] };
  }
  const pane = await paneGet(options.runner, options.state.repo_root, paneId);
  if (pane.exitCode !== 0) {
    if (isMissingPaneFailure(pane)) {
      return { signal: 'stopped', warnings: [`pane ${paneId} is missing; treating as stopped`] };
    }
    return { signal: 'unknown', warnings: [`could not validate pane ${paneId}: ${describeFailure(pane, 'pane get failed')}`] };
  }
  for (const signal of ['done', 'blocked', 'idle', 'working'] as const) {
    const result = await waitAgentStatus(options.runner, options.state.repo_root, paneId, signal, options.timeoutMs);
    if (result.exitCode === 0) {
      return { signal, warnings: [] };
    }
    if (isCapabilityFailure(result)) {
      return { signal: 'unknown', warnings: [`activity signal unavailable: ${describeFailure(result, 'wait agent-status failed')}`] };
    }
  }
  return { signal: 'unknown', warnings: [] };
}

export function isMissingPaneFailure(result: CommandResult): boolean {
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

function isCapabilityFailure(result: CommandResult): boolean {
  const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return result.error?.code === 'ENOENT' || /\b(unknown command|unknown flag|unrecognized|unsupported)\b/.test(output);
}

function modelForRole(profile: HarnessProfile, role: RoleName): string | null {
  return profile.models?.[role] ?? profile.model ?? null;
}

function thinkingForRole(profile: HarnessProfile, role?: RoleName): string | null {
  if (typeof profile.thinking === 'string') return profile.thinking;
  if (!isRoleMap(profile.thinking)) return null;
  return role ? profile.thinking[role] ?? null : profile.thinking.lead ?? null;
}

function isRoleMap(value: HarnessProfile['thinking']): value is RoleStringMap {
  return Boolean(value && typeof value === 'object');
}

function workspaceIdFromJson(stdout: string): string | null {
  try {
    const value = JSON.parse(stdout) as unknown;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.workspace_id === 'string') return record.workspace_id;
    if (typeof record.workspaceId === 'string') return record.workspaceId;
    return workspaceIdFromWorkspaceContainers(record);
  } catch {
    return null;
  }
}

function workspaceIdFromWorkspaceContainers(record: Record<string, unknown>): string | null {
  const result = record.result;
  if (result && typeof result === 'object') {
    const nested = workspaceIdFromWorkspaceContainers(result as Record<string, unknown>);
    if (nested) return nested;
  }
  const workspace = record.workspace;
  if (workspace && typeof workspace === 'object') {
    const workspaceRecord = workspace as Record<string, unknown>;
    if (typeof workspaceRecord.id === 'string') return workspaceRecord.id;
    if (typeof workspaceRecord.workspace_id === 'string') return workspaceRecord.workspace_id;
    if (typeof workspaceRecord.workspaceId === 'string') return workspaceRecord.workspaceId;
  }
  return null;
}

function firstToken(value: string): string | null {
  return firstLine(value)?.split(/\s+/)[0] ?? null;
}
