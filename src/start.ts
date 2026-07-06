import { join } from 'node:path';
import { createRun, listRunsForInvocation, readRunState, writeJsonAtomic, type LaunchMetadata, type RoleRecord, type RunCreateOptions, type RunCreateResult, type RunState } from './run-state.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { type RoleName } from './defaults.js';
import type { HarnessProfile, PiHerdConfig, RoleStringMap } from './config.js';
import { agentStart, describeFailure, firstLine, HERDR_DELIVERY_ACK_TIMEOUT_MS, paneGet, paneRun as runInPane, paneSendEnter, paneSendText, paneSplit, parseAgentStatus, parsePaneMetadata, verifyCurrentPane as verifyCurrentHerdrPane, waitAgentStatus, workspaceCreate } from './herdr.js';
import { verdictInstruction } from './verdict.js';

/** Options for creating a run and launching its initial visible Herdr/Pi sessions. */
export interface StartOptions extends Omit<RunCreateOptions, 'withWorktrees'> {
  env?: NodeJS.ProcessEnv;
}

/** Result for `pi-herd start`, including persisted run state, launched session refs, and warning-only readiness notes. */
export interface StartResult extends RunCreateResult {
  launched: LaunchRef[];
  warnings: string[];
}

/** A visible launch reference persisted or reported after a successful launch step. */
export interface LaunchRef {
  role: 'lead' | RoleName;
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

/** Herdr launch metadata captured for a lead or worker session. */
export interface HerdrLaunchResult {
  workspaceId: string | null;
  tabId: string | null;
  paneId: string;
  sessionRef: string | null;
  launchMethod: 'herdr-agent-start' | 'herdr-pane-run' | 'bound-current-pane';
  metadata?: LaunchMetadata;
}

/** Create run artifacts, bind or create lead, launch planner, and stage selected workers, refusing duplicate starts from an already-bound active lead pane. */
export async function startRun(options: StartOptions): Promise<StartResult> {
  const runner = options.runner ?? nodeCommandRunner;
  await assertCurrentPaneIsNotActiveLead(options, runner);
  const result = await createRun({ ...options, withWorktrees: 'auto', runner });
  const statePath = result.statePath;
  const state = result.state;
  const launched: LaunchRef[] = [];
  const warnings: string[] = [];

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

      const plannerReady = await waitForRoleReady(runner, state.repo_root, planner.paneId, 'planner');
      if (plannerReady) {
        warnings.push(plannerReady);
      }
      const kickoffNote = await sendPlannerKickoff(runner, planner.paneId, state);
      if (kickoffNote) {
        warnings.push(kickoffNote);
      }
      state.roles.planner.status = 'working';
      state.roles.planner.launch_metadata = { ...state.roles.planner.launch_metadata, prompt_method: 'pane-send-text-enter' };
      state.roles.planner.last_activity_at = new Date().toISOString();
      state.roles.planner.pass = 1;
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

    for (const role of state.role_order ?? Object.keys(state.roles)) {
      if (role === 'planner' || role === 'implementer') {
        continue;
      }
      const record = state.roles[role];
      if (record) {
        record.status = 'staged';
      }
    }
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    return { ...result, launched, warnings };
  } catch (error) {
    state.status = 'failed';
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    throw error;
  }
}
async function assertCurrentPaneIsNotActiveLead(options: StartOptions, runner: CommandRunner): Promise<void> {
  const env = options.env ?? process.env;
  if (env.HERDR_ENV !== '1' || !env.HERDR_PANE_ID || env.PI_CODING_AGENT !== 'true') {
    return;
  }

  const runs = await listRunsForInvocation(options.cwd, options.configPath, runner, false);
  for (const run of runs) {
    let state: RunState;
    try {
      state = await readRunState(join(run.canonical_run_dir, 'state.json'));
    } catch {
      continue;
    }
    if (state.status !== 'active') {
      continue;
    }
    if (state.lead_binding.herdr_pane_id !== env.HERDR_PANE_ID) {
      continue;
    }
    const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
    if (!verified) {
      continue;
    }
    throw new Error(`Current pane is already the lead for active pi-herd run ${state.run_id} (${state.run_slug}).\nUse /herd status or pi-herd status to inspect it. Complete or abandon the run with pi-herd cleanup --complete or pi-herd cleanup --abandon before starting another run from this pane.`);
  }
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
  for (const warning of result.warnings) {
    lines.push(`Warning: ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

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

/** Launch a worker role session inside the bound lead workspace. */
export async function launchRoleSession(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: RoleName; cwd: string }): Promise<HerdrLaunchResult> {
  const leadWorkspace = options.state.lead_binding.herdr_workspace_id;
  if (!leadWorkspace) {
    throw new Error('Lead workspace is missing; cannot launch worker session.');
  }
  return launchHarnessInHerdr({ ...options, workspaceId: leadWorkspace });
}

async function launchHarnessInHerdr(options: { state: RunState; config: PiHerdConfig; runner: CommandRunner; role: 'lead' | RoleName; cwd: string; workspaceId: string }): Promise<HerdrLaunchResult> {
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

async function sendPlannerKickoff(runner: CommandRunner, paneId: string, state: RunState): Promise<string | null> {
  const planner = state.roles.planner;
  const artifact = planner?.required_artifacts[0] ?? 'PLAN.md';
  const planPath = join(state.canonical_run_dir, artifact);
  const prompt = `You are the planner for pi-herd run ${state.run_id}.\nGoal: ${state.goal}\nWrite your plan to ${planPath}.\nDo not edit source files unless explicitly instructed by the lead.\n\n${verdictInstruction(planPath, 1)}`;
  try {
    const delivery = await sendToPane(runner, state.repo_root, paneId, prompt);
    return delivery.note ? `planner kickoff: ${delivery.note}` : null;
  } catch (error) {
    planner!.status = 'failed';
    throw error;
  }
}

/** Delivery verification outcome for a submitted pane prompt. */
export interface PaneDelivery {
  verification: 'verified' | 'ambiguous' | 'unverified';
  note: string | null;
}

/**
 * Submit text to a Herdr pane as one send-text payload followed by Enter, then verify delivery.
 * Delivery is verified only when the pane provably transitions from a non-working agent status to working after submit.
 * A pane that was already working or had an unknown status before submit yields an ambiguous result, and a missing transition yields an unverified warning.
 * Enter failure may leave unsubmitted text in the pane.
 */
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

function plannerCwd(state: RunState): string {
  return state.roles.planner?.worktree_path ?? state.repo_root;
}

function modelForRole(profile: HarnessProfile, role: RoleName): string | null {
  return profile.models?.[role] ?? profile.model ?? null;
}

function thinkingForRole(profile: HarnessProfile, role?: RoleName): string | null {
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

function workspaceIdFromJson(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return workspaceIdFromWorkspaceContainers(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

function workspaceIdFromWorkspaceContainers(record: Record<string, unknown>): string | null {
  for (const key of ['workspace']) {
    const child = record[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const id = (child as Record<string, unknown>).id;
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
  }
  for (const key of ['result', 'data']) {
    const child = record[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const id = workspaceIdFromWorkspaceContainers(child as Record<string, unknown>);
      if (id) {
        return id;
      }
    }
  }
  return null;
}

function firstToken(value: string): string | null {
  return firstLine(value)?.split(/\s+/)[0] ?? null;
}
