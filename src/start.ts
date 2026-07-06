import { join } from 'node:path';
import { createRun, listRunsForInvocation, readRunState, writeJsonAtomic, type LaunchMetadata, type RunCreateOptions, type RunCreateResult, type RunState } from './run-state.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { type RoleName } from './defaults.js';
import { createHarnessAdapter, applyRoleLaunch, type HarnessAdapter } from './harness.js';
import { verdictInstruction } from './verdict.js';

export { buildPiCommand, sendToPane, waitForRoleReady, applyRoleLaunch, verifyCurrentPane } from './harness.js';
export type { HarnessLaunchResult as HerdrLaunchResult, PaneDelivery } from './harness.js';

/** Options for creating a run and launching its initial visible Herdr/Pi sessions. */
export interface StartOptions extends Omit<RunCreateOptions, 'withWorktrees'> {
  env?: NodeJS.ProcessEnv;
  harness?: HarnessAdapter;
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

/** Create run artifacts, bind or create lead, launch planner, and stage selected workers, refusing duplicate starts from an already-bound active lead pane. */
export async function startRun(options: StartOptions): Promise<StartResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const harness = options.harness ?? createHarnessAdapter();
  await assertCurrentPaneIsNotActiveLead(options, runner, harness);
  const result = await createRun({ ...options, withWorktrees: 'auto', runner });
  const statePath = result.statePath;
  const state = result.state;
  const launched: LaunchRef[] = [];
  const warnings: string[] = [];

  try {
    const lead = await harness.bindOrLaunchLead({ state, config: result.config, runner, env: options.env ?? process.env });
    state.lead_binding.herdr_workspace_id = lead.workspaceId;
    state.lead_binding.herdr_tab_id = lead.tabId;
    state.lead_binding.herdr_pane_id = lead.paneId;
    state.lead_binding.session_ref = lead.sessionRef;
    state.updated_at = new Date().toISOString();
    await writeJsonAtomic(statePath, state);
    launched.push({ role: 'lead', paneId: lead.paneId, sessionRef: lead.sessionRef, launchMethod: lead.launchMethod });

    if (state.roles.planner) {
      const planner = await harness.launchRoleSession({ state, config: result.config, runner, role: 'planner', cwd: plannerCwd(state) });
      applyRoleLaunch(state.roles.planner, planner);
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      launched.push({ role: 'planner', paneId: planner.paneId, sessionRef: planner.sessionRef, launchMethod: planner.launchMethod });

      const plannerReady = await harness.waitForRoleReady(runner, state.repo_root, planner.paneId, 'planner');
      if (plannerReady) {
        warnings.push(plannerReady);
      }
      const kickoffNote = await sendPlannerKickoff(harness, runner, planner.paneId, state);
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

    for (const role of state.role_order ?? Object.keys(state.roles)) {
      const record = state.roles[role];
      if (!record || role === 'planner' || record.expected_writes !== 'worktree') {
        continue;
      }
      if (!record.worktree_path) {
        const label = role === 'implementer' ? 'Implementer' : `Source role ${role}`;
        throw new Error(`${label} worktree was not materialized; cannot launch staged source session.`);
      }
      const source = await harness.launchRoleSession({ state, config: result.config, runner, role, cwd: record.worktree_path });
      applyRoleLaunch(record, source);
      record.status = 'staged';
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      launched.push({ role, paneId: source.paneId, sessionRef: source.sessionRef, launchMethod: source.launchMethod });
    }

    for (const role of state.role_order ?? Object.keys(state.roles)) {
      const record = state.roles[role];
      if (!record || role === 'planner' || record.expected_writes === 'worktree') {
        continue;
      }
      record.status = 'staged';
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

async function assertCurrentPaneIsNotActiveLead(options: StartOptions, runner: CommandRunner, harness: HarnessAdapter): Promise<void> {
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
    const verified = await harness.verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
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

async function sendPlannerKickoff(harness: HarnessAdapter, runner: CommandRunner, paneId: string, state: RunState): Promise<string | null> {
  const planner = state.roles.planner;
  const artifact = planner?.required_artifacts[0] ?? 'PLAN.md';
  const planPath = join(state.canonical_run_dir, artifact);
  const prompt = `You are the planner for pi-herd run ${state.run_id}.\nGoal: ${state.goal}\nWrite your plan to ${planPath}.\nDo not edit source files unless explicitly instructed by the lead.\n\n${verdictInstruction(planPath, 1)}`;
  try {
    const delivery = await harness.sendToPane(runner, state.repo_root, paneId, prompt);
    return delivery.note ? `planner kickoff: ${delivery.note}` : null;
  } catch (error) {
    if (planner) planner.status = 'failed';
    throw error;
  }
}

function plannerCwd(state: RunState): string {
  return state.roles.planner?.worktree_path ?? state.repo_root;
}
