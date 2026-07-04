import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardRun, formatBoard, nextBoardActions } from '../src/board.js';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { createRun, writeJsonAtomic, type RunState } from '../src/run-state.js';
import type { RunSnapshot } from '../src/status.js';

let dir: string;
const NOW = new Date('2026-07-01T12:00:00.000Z');

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
    throw new Error(`Unexpected command: ${key}`);
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-board-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe('board command', () => {
  it('renders a friendly no-active-run board', async () => {
    const runner = new RecordingRunner(baseResponses({}));

    const result = await boardRun({ cwd: dir, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('No active pi-herd run was found');
    expect(result.text).toContain('pi-herd start <goal>');
  });

  it('renders multiple active runs without selecting one when status targeting is ambiguous', async () => {
    const runner = new RecordingRunner(baseResponses({}));
    await createRun({ cwd: dir, goal: 'First run', now: NOW, runner });
    await createRun({ cwd: dir, goal: 'Second run', now: new Date('2026-07-01T12:01:00.000Z'), runner });

    const result = await boardRun({ cwd: dir, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('Multiple active pi-herd runs');
    expect(result.text).toContain('First run');
    expect(result.text).toContain('Second run');
    expect(result.text).toContain('pi-herd board --run <run_id|slug>');
  });

  it('uses the current Herdr pane binding before showing the multi-run board', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' }),
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));
    const first = await createWorkingRun('planner-pane');
    await createRun({ cwd: dir, goal: 'Second run', now: new Date('2026-07-01T12:01:00.000Z'), runner });
    vi.stubEnv('HERDR_ENV', '1');
    vi.stubEnv('HERDR_PANE_ID', 'lead-pane');
    vi.stubEnv('PI_CODING_AGENT', 'true');

    const result = await boardRun({ cwd: dir, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    expect(result.text).toContain(`Run: ${first.state.run_id}`);
    expect(result.text).not.toContain('Multiple active pi-herd runs');
  });

  it('renders role state, artifacts, warnings, and next actions without writing run state', async () => {
    const { state, statePath } = await createWorkingRun('planner-pane');
    const before = await readFile(statePath, 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr wait agent-status planner-pane --status idle --timeout 250': ok()
    }));

    const result = await boardRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.exitCode).toBe(0);
    expect(result.text).toContain('# pi-herd run board');
    expect(result.text).toContain(`Run: ${state.run_id}`);
    expect(result.text).toContain('planner: stored=working; evaluated=incomplete; signal=idle');
    expect(result.text).toContain('artifact PLAN.md: missing');
    expect(result.text).toContain('pi-herd send planner "<message>"');
    expect(result.text).toContain('pi-herd wait --run');
    await expect(readFile(statePath, 'utf8')).resolves.toBe(before);
  });

  it('suggests diff when the implementer worktree is materialized', async () => {
    const { state } = await createWorkingRun('planner-pane');
    state.roles.implementer!.worktree_status = 'materialized';
    state.roles.implementer!.worktree_path = join(dir, '.worktrees/pi-herd/run/implementer');
    const snapshot = minimalSnapshot(state);

    expect(nextBoardActions(state, snapshot)).toContain(`Review implementation changes: pi-herd diff --run ${state.run_id}`);
  });

  it('bounds very large board output', async () => {
    const { state } = await createWorkingRun('planner-pane');
    const snapshot = minimalSnapshot(state);
    snapshot.warnings = Array.from({ length: 220 }, (_, index) => `warning ${index}`);

    const text = formatBoard(state, snapshot);

    expect(text.split('\n').length).toBeLessThanOrEqual(181);
    expect(text).toContain('more warnings omitted');
  });
});

async function createWorkingRun(plannerPane: string) {
  const runner = new RecordingRunner(baseResponses({}));
  const result = await createRun({ cwd: dir, goal: 'Observe run', now: NOW, runner });
  result.state.lead_binding.herdr_pane_id = 'lead-pane';
  result.state.lead_binding.session_ref = 'lead-session';
  result.state.roles.planner!.status = 'working';
  result.state.roles.planner!.herdr_pane_id = plannerPane;
  result.state.roles.planner!.session_ref = 'planner-session';
  result.state.roles.planner!.last_activity_at = NOW.toISOString();
  result.state.roles.implementer!.status = 'staged';
  result.state.roles.reviewer!.status = 'staged';
  result.state.roles.tester!.status = 'staged';
  await mkdir(join(result.state.canonical_run_dir, 'logs'), { recursive: true });
  await writeJsonAtomic(result.statePath, result.state);
  return result;
}

function minimalSnapshot(state: RunState): RunSnapshot {
  return {
    run_id: state.run_id,
    goal: state.goal,
    status: state.status,
    state_revision: state.state_revision ?? null,
    generated_at: NOW.toISOString(),
    warnings: [],
    roles: Object.values(state.roles).filter(Boolean).map((record) => ({
      role: record!.role,
      stored_status: record!.status,
      evaluated_status: record!.status,
      signal: record!.status === 'working' ? 'working' : 'not-launched',
      pane_id: record!.herdr_pane_id,
      worktree_status: record!.worktree_status,
      artifacts: [],
      warnings: []
    }))
  };
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

function okJson(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
}
