import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { sendMessage, leadStatus, leadCollect, leadBrief } from '../src/messaging.js';
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
  async run(command: string, args: string[]): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    const response = this.responses[key.replaceAll(dir, 'DIR')];
    if (response) return response;
    if (command === 'git' && args[0] === 'show-ref') return { exitCode: 1, stdout: '', stderr: '' };
    throw new Error(`Unexpected command: ${key}`);
  }
}

describe('messaging commands', () => {
  it('sends to an existing role pane and marks the role working', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner });

    expect(result.text).toContain('Sent message to planner');
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
    expect(brief.text).not.toContain('done');
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
