import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { interruptRole, sendMessage, leadStatus, leadCollect, leadBrief } from '../src/messaging.js';
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
    const normalized = key.replace(/\n\n\[pi-herd\] When pass \d+ is complete[\s\S]*$/, '').replaceAll(dir, 'DIR');
    const response = this.responses[normalized];
    if (response) return response;
    if (command === 'git' && args[0] === 'show-ref') return { exitCode: 1, stdout: '', stderr: '' };
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return { exitCode: 0, stdout: JSON.stringify({ pane_id: args[2], agent_status: 'idle' }), stderr: '' };
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

    const delivery = await sendToPane(runner, dir, 'pane-1', 'line one\nline two');

    expect(delivery.verification).toBe('verified');
    expect(runner.calls).toEqual([
      'herdr pane get pane-1',
      'herdr pane send-text pane-1 line one\nline two',
      'herdr pane send-keys pane-1 enter',
      'herdr wait agent-status pane-1 --status working --timeout 10000'
    ]);
  });

  it('verifies delivery with no note when a provably non-working pane acknowledges', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get pane-1': okJson({ pane_id: 'pane-1', agent_status: 'blocked' }),
      'herdr pane send-text pane-1 Resume work': ok(),
      'herdr pane send-keys pane-1 enter': ok()
    }));

    const delivery = await sendToPane(runner, dir, 'pane-1', 'Resume work');

    expect(delivery).toEqual({ verification: 'verified', note: null });
    expect(runner.calls).toContain('herdr wait agent-status pane-1 --status working --timeout 10000');
  });

  it('reports ambiguous delivery without an ack wait when the pane was already working', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get pane-1': okJson({ pane_id: 'pane-1', agent_status: 'working' }),
      'herdr pane send-text pane-1 Hold on': ok(),
      'herdr pane send-keys pane-1 enter': ok()
    }));

    const delivery = await sendToPane(runner, dir, 'pane-1', 'Hold on');

    expect(delivery.verification).toBe('ambiguous');
    expect(delivery.note).toContain('already working');
    expect(runner.calls).toEqual([
      'herdr pane get pane-1',
      'herdr pane send-text pane-1 Hold on',
      'herdr pane send-keys pane-1 enter'
    ]);
  });

  it('reports ambiguous delivery when the pre-send pane status is unreadable', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get pane-1': { exitCode: 1, stdout: '', stderr: 'daemon busy\n' },
      'herdr pane send-text pane-1 Try anyway': ok(),
      'herdr pane send-keys pane-1 enter': ok()
    }));

    const delivery = await sendToPane(runner, dir, 'pane-1', 'Try anyway');

    expect(delivery.verification).toBe('ambiguous');
    expect(delivery.note).toContain('could not be proven');
    expect(runner.calls).toContain('herdr wait agent-status pane-1 --status working --timeout 10000');
  });

  it('reports unverified delivery when the pane never acknowledges working', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text pane-1 Ping': ok(),
      'herdr pane send-keys pane-1 enter': ok(),
      'herdr wait agent-status pane-1 --status working --timeout 10000': { exitCode: 1, stdout: '', stderr: '' }
    }));

    const delivery = await sendToPane(runner, dir, 'pane-1', 'Ping');

    expect(delivery.verification).toBe('unverified');
    expect(delivery.note).toContain('did not report working within 10s');
    expect(delivery.note).toContain('retry may duplicate the prompt');
  });

  it('sends to an existing role pane and marks the role working', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner });

    expect(result.text).toContain('Sent message to planner');
    expect(result.text).toContain('Delivery verified: planner reported working.');
    expect(runner.calls).toContain('herdr pane get planner-pane');
    expect(runner.calls).toContain('herdr wait agent-status planner-pane --status working --timeout 10000');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
    expect(saved.roles.planner?.last_activity_at).toBeTruthy();
  });

  it('warns about unverified delivery while still marking the role working', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok(),
      'herdr wait agent-status planner-pane --status working --timeout 10000': { exitCode: 1, stdout: '', stderr: '' }
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner });

    expect(result.text).not.toContain('Delivery verified');
    expect(result.text).toContain('Warning: pane planner-pane did not report working');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
  });

  it('appends the pass-1 verdict instruction to the delivered prompt and persists the pass', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner });

    const sendCall = runner.calls.find((call) => call.startsWith('herdr pane send-text planner-pane'));
    expect(sendCall).toContain('Continue planning\n\n[pi-herd] When pass 1 is complete');
    expect(sendCall).toContain(`end ${join(state.canonical_run_dir, 'PLAN.md')} with the line: pi-herd-verdict: done pass=1`);
    expect(result.text).toContain('Pass 1: verdict instruction appended to the prompt.');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.pass).toBe(1);
  });

  it('does not claim verdict instruction when the role has no required artifacts', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    state.roles.planner!.required_artifacts = [];
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const result = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner });

    expect(result.text).toContain('Sent message to planner');
    expect(result.text).toContain('Delivery verified: planner reported working.');
    expect(result.text).not.toContain('verdict instruction appended');
    expect(result.text).not.toContain('Pass 1:');
    const sendCall = runner.calls.find((call) => call.startsWith('herdr pane send-text planner-pane'));
    expect(sendCall).toBe('herdr pane send-text planner-pane Continue planning');
    expect(sendCall).not.toContain('[pi-herd]');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.pass).toBe(1);
  });

  it('advances the verdict instruction to pass 2 on a second send', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Draft the plan': ok(),
      'herdr pane send-text planner-pane Address review notes': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Draft the plan', runner });
    const second = await sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Address review notes', runner });

    const sendCalls = runner.calls.filter((call) => call.startsWith('herdr pane send-text planner-pane'));
    expect(sendCalls).toHaveLength(2);
    expect(sendCalls[0]).toContain('pi-herd-verdict: done pass=1');
    expect(sendCalls[1]).toContain('Address review notes\n\n[pi-herd] When pass 2 is complete');
    expect(sendCalls[1]).toContain('pi-herd-verdict: done pass=2');
    expect(second.text).toContain('Pass 2: verdict instruction appended to the prompt.');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.pass).toBe(2);
  });

  it('reserves a pass without marking working when pane delivery fails', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': { exitCode: 1, stdout: '', stderr: 'send failed\n' }
    }));

    await expect(sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Continue planning', runner })).rejects.toThrow(/Could not send pane text/);

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.pass).toBe(1);
    expect(saved.roles.planner?.status).toBe('staged');
    expect(saved.roles.planner?.last_activity_at).toBeNull();
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

  it('falls back to the single active run when the environment pane is verified but unbound', async () => {
    await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'other-pane', workspace_id: 'lead-ws', tab_id: 'other-tab' }),
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

  it('does not clear state when pane validation fails ambiguously', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    state.roles.planner!.session_ref = `${state.run_id}-planner`;
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get planner-pane': { exitCode: 1, stdout: '', stderr: 'daemon unavailable\n' }
    }));

    await expect(sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'No mutate', runner })).rejects.toThrow(/daemon unavailable/);

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.herdr_pane_id).toBe('planner-pane');
    expect(saved.roles.planner?.session_ref).toBe(`${state.run_id}-planner`);
  });

  it('does not relaunch for pane get capability errors', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    state.roles.planner!.session_ref = `${state.run_id}-planner`;
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get planner-pane': { exitCode: 1, stdout: '', stderr: 'unknown command: pane get\n' }
    }));

    await expect(sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'No relaunch', runner })).rejects.toThrow(/unknown command: pane get/);

    expect(runner.calls.some((call) => call.includes('agent start'))).toBe(false);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.herdr_pane_id).toBe('planner-pane');
    expect(saved.roles.planner?.session_ref).toBe(`${state.run_id}-planner`);
  });

  it('keeps stale pane refs if replacement launch fails', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'old-pane' });
    state.roles.planner!.session_ref = `${state.run_id}-planner`;
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get old-pane': { exitCode: 1, stdout: '', stderr: 'missing pane\n' },
      [`herdr agent start pi-herd-${state.run_id}-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-${state.run_id}-planner --session-id ${state.run_id}-planner`]: { exitCode: 1, stdout: '', stderr: 'launch failed\n' },
      'herdr pane split lead-pane --direction down --cwd DIR --no-focus': { exitCode: 1, stdout: '', stderr: 'split failed\n' }
    }));

    await expect(sendMessage({ cwd: dir, run: state.run_id, role: 'planner', message: 'Retry after stale', runner })).rejects.toThrow(/launch failed/);

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.herdr_pane_id).toBe('old-pane');
    expect(saved.roles.planner?.session_ref).toBe(`${state.run_id}-planner`);
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

  it('launches a selected custom artifact role on first send without materializing a worktree', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), customAuditRoleConfig(), 'utf8');
    const createRunner = new RecordingRunner(baseResponses({}));
    const result = await createRun({ cwd: dir, goal: 'Audit implementation', now: NOW, runner: createRunner });
    result.state.lead_binding.herdr_workspace_id = 'lead-ws';
    result.state.lead_binding.herdr_pane_id = 'lead-pane';
    await writeJsonAtomic(result.statePath, result.state);
    const runner = new RecordingRunner(baseResponses({
      [`herdr agent start pi-herd-${result.state.run_id}-audit_bot --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-${result.state.run_id}-audit_bot --session-id ${result.state.run_id}-audit_bot`]: okJson({ pane_id: 'audit-pane', workspace_id: 'lead-ws', tab_id: 'audit-tab' }),
      'herdr wait agent-status audit-pane --status idle --timeout 15000': ok(),
      'herdr pane send-text audit-pane Inspect implementation': ok(),
      'herdr pane send-keys audit-pane enter': ok()
    }));

    const send = await sendMessage({ cwd: dir, run: result.state.run_id, role: 'audit_bot', message: 'Inspect implementation', runner });

    expect(send.text).toContain('Activating audit_bot: launching session.');
    expect(send.text).toContain('Sent message to audit_bot (audit-pane).');
    expect(send.text).toContain('Pass 1: verdict instruction appended to the prompt.');
    expect(runner.calls.some((call) => call.includes('worktree create'))).toBe(false);
    const sendCall = runner.calls.find((call) => call.startsWith('herdr pane send-text audit-pane'));
    expect(sendCall).toContain(`end ${join(result.state.canonical_run_dir, 'AUDIT.md')} with the line: pi-herd-verdict: done pass=1`);
    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.audit_bot).toMatchObject({
      display_name: 'Audit Bot',
      expected_writes: 'artifacts',
      required_artifacts: ['AUDIT.md'],
      herdr_pane_id: 'audit-pane',
      worktree_path: null,
      status: 'working'
    });
  });

  it('interrupts a launched role pane and marks the stored status blocked', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-keys planner-pane escape': ok()
    }));

    const result = await interruptRole({ cwd: dir, run: state.run_id, role: 'planner', runner });

    expect(result.text).toContain('Sent Escape to planner (planner-pane)');
    expect(result.text).toContain('Re-prompt with pi-herd send planner');
    expect(runner.calls).toContain('herdr pane send-keys planner-pane escape');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('blocked');
    expect(saved.roles.planner?.last_activity_at).toBeTruthy();
  });

  it('refuses to interrupt a role without a launched pane', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({}));

    await expect(interruptRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow(/reviewer has no launched pane to interrupt/);
  });

  it('reports a missing pane on interrupt without sending Escape', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get planner-pane': { exitCode: 1, stdout: '', stderr: 'missing pane\n' }
    }));

    await expect(interruptRole({ cwd: dir, run: state.run_id, role: 'planner', runner })).rejects.toThrow(/planner pane planner-pane is missing; nothing to interrupt/);

    expect(runner.calls.some((call) => call.includes('escape'))).toBe(false);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('staged');
  });

  it('does not send Escape when interrupt pane validation is ambiguous', async () => {
    const { state } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get planner-pane': { exitCode: null, stdout: '', stderr: '', timedOut: true }
    }));

    await expect(interruptRole({ cwd: dir, run: state.run_id, role: 'planner', runner })).rejects.toThrow(/Could not validate planner pane planner-pane/);
    expect(runner.calls.some((call) => call.includes('escape'))).toBe(false);
  });

  it('keeps the stored role status when Escape delivery fails', async () => {
    const { state, statePath } = await createStartedRun({ plannerPane: 'planner-pane' });
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-keys planner-pane escape': { exitCode: 1, stdout: '', stderr: 'send-keys failed\n' }
    }));

    await expect(interruptRole({ cwd: dir, run: state.run_id, role: 'planner', runner })).rejects.toThrow(/Could not send Escape to planner pane planner-pane/);

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('staged');
    expect(saved.roles.planner?.last_activity_at).toBeNull();
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

function customAuditRoleConfig(): string {
  return [
    'schema_version: 1',
    'harness:',
    '  default: pi',
    '  profiles:',
    '    pi:',
    '      command: pi',
    'paths:',
    '  runs_dir: .pi-herd/runs',
    '  prompts_dir: .pi-herd/prompts',
    'roles:',
    '  default:',
    '    - audit_bot',
    '  definitions:',
    '    audit_bot:',
    '      display_name: Audit Bot',
    '      expected_writes: artifacts',
    '      required_artifacts:',
    '        - AUDIT.md',
    ''
  ].join('\n');
}

function ok(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

function okJson(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
}
