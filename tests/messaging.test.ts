import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { sendMessage, leadStatus, leadCollect, leadBrief } from '../src/messaging.js';
import { sendToPane } from '../src/start.js';
import { createRun, writeJsonAtomic, type RunState } from '../src/run-state.js';

let dir: string;
const NOW = new Date('2026-07-01T12:00:00.000Z');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-message-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

class RecordingRunner implements CommandRunner {
  calls: string[] = [];
  constructor(private readonly responses: Record<string, CommandResult>) {}
  async run(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    if (command === 'git' && args.join(' ') === 'rev-parse --show-toplevel' && options?.cwd?.includes(`${dir}${sep}.worktrees${sep}`)) {
      return { exitCode: 0, stdout: `${options.cwd}\n`, stderr: '' };
    }
    const response = this.responses[key.replaceAll(dir, 'DIR')];
    if (response) return response;
    if (command === 'git' && args[0] === 'show-ref') return { exitCode: 1, stdout: '', stderr: '' };
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return { exitCode: 0, stdout: JSON.stringify({ pane_id: args[2] }), stderr: '' };
    if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') return { exitCode: 0, stdout: '', stderr: '' };
    throw new Error(`Unexpected command: ${key}`);
  }
}

describe('messaging commands', () => {
  it('submits multi-line pane text as one send-text call plus Enter', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text pane-1 line one\nline two': ok(),
      'herdr pane send-keys pane-1 enter': ok()
    }));

    await sendToPane(runner, dir, 'pane-1', 'line one\nline two');

    expect(runner.calls).toEqual([
      'herdr pane send-text pane-1 line one\nline two',
      'herdr pane send-keys pane-1 enter'
    ]);
  });

  it('sends to an existing role pane and marks the role working', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner });

    expect(result.text).toContain('Sent message to planner');
    expect(runner.calls).toContain('herdr pane get planner-pane');
    expect(runner.calls.some((call) => call.includes('wait agent-status'))).toBe(false);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
    expect(saved.roles.planner?.last_activity_at).toBeTruthy();
  });

  it('requires lead commands to run from the bound lead pane', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({}));

    await expect(sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Nope', requireLead: true, runner, env: {} })).rejects.toThrow(/bound Pi lead pane/);
  });

  it('allows lead send from the verified bound lead pane', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' }),
      'herdr pane send-text planner-pane Lead approved': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({
      cwd: dir,
      run: state.run_id,
      role: 'planner',
      message: 'Lead approved',
      requireLead: true,
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', PI_CODING_AGENT: 'true' }
    });

    expect(result.text).toContain('Sent message to planner');
  });

  it('rejects lead send when the environment pane is not current', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'other-pane', workspace_id: 'lead-ws', tab_id: 'other-tab' })
    }));

    await expect(sendMessage({
      cwd: dir,
      run: state.run_id,
      role: 'planner',
      message: 'Lead approved',
      requireLead: true,
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', PI_CODING_AGENT: 'true' }
    })).rejects.toThrow(/bound Pi lead pane/);
    expect(runner.calls).not.toContain('herdr pane get lead-pane');
  });

  it('resolves the active run from a role worktree when --run is omitted', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const worktreeCwd = join(dir, '.worktrees/pi-herd', state.run_id, 'planner');
    await mkdir(worktreeCwd, { recursive: true });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'planner-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane Worktree resolved': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({
      cwd: worktreeCwd,
      role: 'planner',
      message: 'Worktree resolved',
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'planner-pane', PI_CODING_AGENT: 'true' }
    });

    expect(result.text).toContain('Sent message to planner');
  });

  it('resolves the active run from the verified current pane when --run is omitted', async () => {
    await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'planner-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane Pane resolved': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({
      cwd: dir,
      role: 'planner',
      message: 'Pane resolved',
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'planner-pane', PI_CODING_AGENT: 'true' }
    });

    expect(result.text).toContain('Sent message to planner');
  });

  it('does not resolve an omitted run from a non-current environment pane', async () => {
    await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'other-pane', workspace_id: 'lead-ws', tab_id: 'other-tab' })
    }));

    await expect(sendMessage({
      cwd: dir,
      role: 'planner',
      message: 'Pane resolved',
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'planner-pane', PI_CODING_AGENT: 'true' }
    })).rejects.toThrow(/Current pane is not bound to an active run/);
    expect(runner.calls).not.toContain('herdr pane get planner-pane');
  });

  it('prints state-only lead status and read-only collect inventory', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({}));

    const status = await leadStatus({ cwd: dir, run: state.run_id, runner });
    const collect = await leadCollect({ cwd: dir, run: state.run_id, runner });
    const brief = await leadBrief({ cwd: dir, run: state.run_id, runner });

    expect(status.text).toContain(`Run ${state.run_id}`);
    expect(status.text).toContain('planner: staged');
    expect(collect.text).toContain('Artifact inventory');
    expect(collect.text).toContain('missing planner/PLAN.md');
    expect(brief.text).toContain('# pi-herd brief');
    expect(brief.text).toContain('- planner: staged;');
    expect(brief.text).not.toMatch(/- planner: done;/);
  });

  it('uses custom runs_dir and relative config paths during activation', async () => {
    const subdir = join(dir, 'subdir');
    await mkdir(subdir, { recursive: true });
    await writeFile(join(subdir, 'herd.yaml'), [
      'schema_version: 1',
      'harness:',
      '  default: custom',
      '  profiles:',
      '    custom:',
      '      command: custom-pi',
      'paths:',
      '  runs_dir: custom-runs',
      '  prompts_dir: .pi-herd/prompts',
      ''
    ].join('\n'), 'utf8');
    const runner = new RecordingRunner(baseResponses({}));
    const result = await createRun({ cwd: subdir, configPath: 'herd.yaml', goal: 'Custom config', now: NOW, runner });
    result.state.lead_binding.herdr_workspace_id = 'lead-ws';
    result.state.roles.reviewer!.source_ref = `pi-herd/${result.state.run_id}/impl`;
    await writeJsonAtomic(result.statePath, result.state);
    const reviewerPath = join(dir, '.worktrees/pi-herd', result.state.run_id, 'reviewer');
    const sendRunner = new RecordingRunner(baseResponses({
      'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees :!custom-runs': ok(),
      [`git rev-parse --verify --quiet pi-herd/${result.state.run_id}/impl`]: ok(),
      [`herdr worktree create --cwd DIR --branch pi-herd/${result.state.run_id}/reviewer --base pi-herd/${result.state.run_id}/impl --path DIR/.worktrees/pi-herd/${result.state.run_id}/reviewer --label pi-herd custom-config reviewer --no-focus --json`]: okJson({ workspace_id: 'review-wt-ws', checkout_path: reviewerPath, branch: `pi-herd/${result.state.run_id}/reviewer` }),
      [`herdr agent start pi-herd-${result.state.run_id}-reviewer --cwd DIR/.worktrees/pi-herd/${result.state.run_id}/reviewer --workspace lead-ws --split down --no-focus -- custom-pi --name pi-herd-${result.state.run_id}-reviewer --session-id ${result.state.run_id}-reviewer`]: okJson({ pane_id: 'review-pane', workspace_id: 'lead-ws', tab_id: 'review-tab' }),
      'herdr pane send-text review-pane Review with custom config': ok(),
      'herdr pane send-keys review-pane enter': ok()
    }));

    const send = await sendMessage({ cwd: subdir, configPath: 'herd.yaml', run: result.state.run_id, role: 'reviewer', message: 'Review with custom config', runner: sendRunner });

    expect(send.text).toContain('Activating reviewer: materializing worktree');
    expect(sendRunner.calls).toContain('git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees :!custom-runs');
  });

  it('relaunches a stale role pane before sending', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'old-pane' });
    state.roles.planner!.session_ref = `${state.run_id}-planner`;
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get old-pane': { exitCode: 1, stdout: '', stderr: 'missing pane\n' },
      [`herdr agent start pi-herd-${state.run_id}-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-${state.run_id}-planner --session-id ${state.run_id}-planner`]: okJson({ pane_id: 'new-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' }),
      'herdr wait agent-status new-pane --status idle --timeout 15000': ok(),
      'herdr pane send-text new-pane Retry after stale': ok(),
      'herdr pane send-keys new-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Retry after stale', runner });

    expect(result.text).toContain('Detected stale pane for planner; relaunching.');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.herdr_pane_id).toBe('new-pane');
    expect(saved.roles.planner?.status).toBe('working');
  });

  it('does not clear state when pane validation times out', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get planner-pane': { exitCode: null, stdout: '', stderr: '', timedOut: true }
    }));

    await expect(sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'No mutate', runner })).rejects.toThrow(/Could not validate planner pane/);

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.herdr_pane_id).toBe('planner-pane');
  });

  it('activates reviewer from the implementation branch before first send', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const reviewerPath = join(dir, '.worktrees/pi-herd', state.run_id, 'reviewer');
    const runner = new RecordingRunner(baseResponses({
      [`git rev-parse --verify --quiet pi-herd/${state.run_id}/impl`]: ok(),
      [`herdr worktree create --cwd DIR --branch pi-herd/${state.run_id}/reviewer --base pi-herd/${state.run_id}/impl --path DIR/.worktrees/pi-herd/${state.run_id}/reviewer --label pi-herd send-review reviewer --no-focus --json`]: okJson({ workspace_id: 'review-wt-ws', checkout_path: reviewerPath, branch: `pi-herd/${state.run_id}/reviewer` }),
      [`herdr agent start pi-herd-${state.run_id}-reviewer --cwd DIR/.worktrees/pi-herd/${state.run_id}/reviewer --workspace lead-ws --split down --no-focus -- pi --name pi-herd-${state.run_id}-reviewer --session-id ${state.run_id}-reviewer`]: okJson({ pane_id: 'review-pane', workspace_id: 'lead-ws', tab_id: 'review-tab' }),
      'herdr pane send-text review-pane Review implementation': ok(),
      'herdr pane send-keys review-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'reviewer', message: 'Review implementation', runner });

    expect(result.text).toContain('Activating reviewer: materializing worktree');
    expect(result.text).toContain('Activating reviewer: launching session');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(runner.calls).toContain('herdr wait agent-status review-pane --status idle --timeout 15000');
    expect(saved.roles.reviewer?.worktree_path).toBe(reviewerPath);
    expect(saved.roles.reviewer?.herdr_pane_id).toBe('review-pane');
    expect(saved.roles.reviewer?.status).toBe('working');
  });
});

async function createStartedRun(options: { plannerPane: string }) {
  const runner = new RecordingRunner(baseResponses({}));
  const result = await createRun({ cwd: dir, goal: 'Send review', now: NOW, runner });
  result.state.lead_binding.herdr_workspace_id = 'lead-ws';
  result.state.lead_binding.herdr_pane_id = 'lead-pane';
  result.state.roles.planner!.status = 'staged';
  result.state.roles.planner!.herdr_workspace_id = 'lead-ws';
  result.state.roles.planner!.herdr_pane_id = options.plannerPane;
  await writeJsonAtomic(result.statePath, result.state);
  return result;
}

function baseResponses(overrides: Record<string, CommandResult>): Record<string, CommandResult> {
  return {
    'git rev-parse --show-toplevel': { exitCode: 0, stdout: `${dir}\n`, stderr: '' },
    'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' },
    'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': ok(),
    ...normalize(overrides)
  };
}

function normalize(responses: Record<string, CommandResult>): Record<string, CommandResult> {
  const normalized: Record<string, CommandResult> = {};
  for (const [key, value] of Object.entries(responses)) normalized[key.replaceAll(dir, 'DIR')] = value;
  return normalized;
}

function ok(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

function okJson(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
}
