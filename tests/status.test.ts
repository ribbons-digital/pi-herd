import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { collectRun, statusRun, waitRun } from '../src/status.js';
import { createRun, writeJsonAtomic, type RunState } from '../src/run-state.js';

let dir: string;
const NOW = new Date('2026-07-01T12:00:00.000Z');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-status-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type TestResponse = CommandResult | (() => CommandResult | Promise<CommandResult>);

class RecordingRunner implements CommandRunner {
  calls: string[] = [];
  constructor(private readonly responses: Record<string, TestResponse>) {}
  async run(command: string, args: string[]): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    const response = this.responses[key.replaceAll(dir, 'DIR')];
    if (typeof response === 'function') return response();
    if (response) return response;
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return okJson({ pane_id: args[2] });
    if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') return { exitCode: 1, stdout: '', stderr: 'timeout\n' };
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'read') return okText(`log for ${args[2]}\n`);
    throw new Error(`Unexpected command: ${key}`);
  }
}

describe('status, wait, and collect commands', () => {
  it('reports incomplete for idle roles with missing artifacts without writing state', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await statusRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('planner: stored=working; evaluated=incomplete; signal=idle');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
  });

  it('does not mark done when the activity signal is unknown even with valid artifacts', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    await writeFile(join(state.canonical_run_dir, 'PLAN.md'), 'approved plan\n', 'utf8');
    const runner = new RecordingRunner(baseResponses({}));

    const result = await statusRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('planner: stored=working; evaluated=working; signal=unknown');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
  });

  it('persists done from wait only when signal and artifacts agree', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    await writeFile(join(state.canonical_run_dir, 'PLAN.md'), 'approved plan\n', 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await waitRun({ cwd: dir, run: state.run_id, timeoutMs: 10, pollIntervalMs: 1, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('done');
    expect(saved.state_revision).toBe(1);
  });

  it('treats artifacts older than the current pass as stale', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    const artifactPath = join(state.canonical_run_dir, 'PLAN.md');
    await writeFile(artifactPath, 'old plan\n', 'utf8');
    await utimes(artifactPath, new Date('2026-07-01T11:59:50.000Z'), new Date('2026-07-01T11:59:50.000Z'));
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await waitRun({ cwd: dir, run: state.run_id, timeoutMs: 10, pollIntervalMs: 1, runner, now: NOW });

    expect(result.exitCode).toBe(3);
    expect(result.text).toContain('stale PLAN.md');
    expect(result.text).toContain('PLAN.md is stale for the current pass');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('incomplete');
  });

  it('treats artifacts written within the previous freshness grace as stale', async () => {
    const { state } = await createWorkingRun('planner-pane');
    const artifactPath = join(state.canonical_run_dir, 'PLAN.md');
    await writeFile(artifactPath, 'almost current plan\n', 'utf8');
    await utimes(artifactPath, new Date('2026-07-01T11:59:59.000Z'), new Date('2026-07-01T11:59:59.000Z'));
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await statusRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('stale PLAN.md');
    expect(result.text).toContain('PLAN.md is stale for the current pass');
  });

  it('does not retroactively flip stored done roles when artifacts are stale', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    state.roles.planner!.status = 'done';
    const artifactPath = join(state.canonical_run_dir, 'PLAN.md');
    await writeFile(artifactPath, 'old plan\n', 'utf8');
    await utimes(artifactPath, new Date('2026-07-01T11:59:50.000Z'), new Date('2026-07-01T11:59:50.000Z'));
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await statusRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('planner: stored=done; evaluated=done');
    expect(result.text).toContain('stale PLAN.md');
  });

  it('maps a missing pane to stopped and persists incomplete when artifacts are missing', async () => {
    const { state, statePath } = await createWorkingRun('gone-pane');
    const runner = new RecordingRunner(baseResponses({
      'herdr pane get gone-pane': { exitCode: 1, stdout: '', stderr: 'missing pane\n' }
    }));

    const result = await waitRun({ cwd: dir, run: state.run_id, timeoutMs: 10, pollIntervalMs: 1, runner, now: NOW });

    expect(result.exitCode).toBe(3);
    expect(result.text).toContain('signal=stopped');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('incomplete');
  });

  it('excludes staged roles from wait completion targets', async () => {
    const { state } = await createWorkingRun('planner-pane');
    state.roles.planner!.status = 'staged';
    const statePath = join(state.canonical_run_dir, 'state.json');
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await waitRun({ cwd: dir, run: state.run_id, timeoutMs: 10, pollIntervalMs: 1, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('planner: stored=staged; evaluated=incomplete; signal=idle');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('staged');
    expect(saved.state_revision).toBeUndefined();
  });

  it('keeps polling a stored blocked role that reports working again', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    state.roles.planner!.status = 'blocked';
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status working --timeout 250': ok()
    }));

    const result = await waitRun({
      cwd: dir,
      run: state.run_id,
      timeoutMs: 1,
      pollIntervalMs: 1,
      runner,
      now: NOW,
      sleep: async () => undefined
    });

    expect(result.exitCode).toBe(2);
    expect(result.text).toContain('planner: stored=blocked; evaluated=working; signal=working');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('blocked');
    expect(saved.state_revision).toBeUndefined();
  });

  it('maps a blocked activity signal to blocked status', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status blocked --timeout 250': ok()
    }));

    const result = await waitRun({ cwd: dir, run: state.run_id, timeoutMs: 10, pollIntervalMs: 1, runner, now: NOW });

    expect(result.exitCode).toBe(3);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('blocked');
  });

  it('does not overwrite a fresher status with a stale role verdict', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    await writeFile(join(state.canonical_run_dir, 'PLAN.md'), 'approved plan\n', 'utf8');
    let rewroteFreshStatus = false;
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': async () => {
        if (!rewroteFreshStatus) {
          const fresh = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
          fresh.roles.planner!.status = 'blocked';
          await writeJsonAtomic(statePath, fresh);
          rewroteFreshStatus = true;
        }
        return ok();
      }
    }));

    const result = await waitRun({ cwd: dir, run: state.run_id, timeoutMs: 10, pollIntervalMs: 1, runner, now: NOW });

    expect(result.exitCode).toBe(3);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('blocked');
    expect(saved.state_revision).toBeUndefined();
  });

  it('warns when artifact-only role worktrees are dirty', async () => {
    const { state } = await createWorkingRun('planner-pane');
    state.roles.reviewer!.worktree_status = 'materialized';
    state.roles.reviewer!.worktree_path = join(dir, 'reviewer-worktree');
    await mkdir(state.roles.reviewer!.worktree_path, { recursive: true });
    const statePath = join(state.canonical_run_dir, 'state.json');
    await writeJsonAtomic(statePath, state);
    const runner = new RecordingRunner(baseResponses({
      'git status --porcelain --untracked-files=all': okText(' M src/file.ts\n')
    }));

    const result = await statusRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('reviewer: artifact-only worktree has source changes:  M src/file.ts');
  });

  it('writes FINAL_SUMMARY.md and pane logs without changing run status', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    await writeFile(join(state.canonical_run_dir, 'PLAN.md'), 'approved plan\n', 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok(),
      'herdr pane read planner-pane --source recent --lines 200 --format text': okText('planner log\n')
    }));

    const result = await collectRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    await expect(readFile(join(state.canonical_run_dir, 'FINAL_SUMMARY.md'), 'utf8')).resolves.toContain('approved plan');
    await expect(readFile(join(state.canonical_run_dir, 'logs', 'planner-planner-pane.log'), 'utf8')).resolves.toBe('planner log\n');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.status).toBe('active');
    expect(saved.roles.planner?.status).toBe('done');
  });

  it('truncates artifact previews by utf8 byte budget without splitting code points', async () => {
    const { state } = await createWorkingRun('planner-pane');
    await writeFile(join(state.canonical_run_dir, 'PLAN.md'), `${'あ'.repeat(9000)}🙂tail`, 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok(),
      'herdr pane read planner-pane --source recent --lines 200 --format text': okText('planner log\n')
    }));

    const result = await collectRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    const preview = result.snapshot.roles.find((role) => role.role === 'planner')?.artifacts[0]?.preview;
    expect(preview).toContain('... truncated to 24000 bytes ...');
    expect(Buffer.byteLength(preview ?? '', 'utf8')).toBeLessThanOrEqual(24000);
    expect(Buffer.from(preview ?? '', 'utf8').toString('utf8')).toBe(preview);
  });
});

async function createWorkingRun(plannerPane: string) {
  const runner = new RecordingRunner(baseResponses({}));
  const result = await createRun({ cwd: dir, goal: 'Observe run', now: NOW, runner });
  result.state.roles.planner!.status = 'working';
  result.state.roles.planner!.herdr_pane_id = plannerPane;
  result.state.roles.planner!.last_activity_at = NOW.toISOString();
  result.state.roles.implementer!.status = 'staged';
  result.state.roles.reviewer!.status = 'staged';
  result.state.roles.tester!.status = 'staged';
  await mkdir(join(result.state.canonical_run_dir, 'logs'), { recursive: true });
  await writeJsonAtomic(result.statePath, result.state);
  return result;
}

function baseResponses(overrides: Record<string, TestResponse>): Record<string, TestResponse> {
  return {
    'git rev-parse --show-toplevel': { exitCode: 0, stdout: `${dir}\n`, stderr: '' },
    'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' },
    ...normalize(overrides)
  };
}

function normalize(responses: Record<string, TestResponse>): Record<string, TestResponse> {
  const normalized: Record<string, TestResponse> = {};
  for (const [key, value] of Object.entries(responses)) normalized[key.replaceAll(dir, 'DIR')] = value;
  return normalized;
}

function ok(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

function okText(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}

function okJson(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
}
