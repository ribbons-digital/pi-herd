import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { cleanupRun, mergePlanRun } from '../src/cleanup.js';
import { createRun, writeJsonAtomic, type RunState } from '../src/run-state.js';

let dir: string;
const NOW = new Date('2026-07-01T12:00:00.000Z');

type TestResponse = CommandResult | ((command: string, args: string[], options?: { cwd?: string }) => CommandResult | Promise<CommandResult>);

class RecordingRunner implements CommandRunner {
  calls: string[] = [];
  constructor(readonly responses: Record<string, TestResponse> = {}) {}
  async run(command: string, args: string[], options?: { cwd?: string }): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    const response = this.responses[key.replaceAll(dir, 'DIR')];
    if (typeof response === 'function') return response(command, args, options);
    if (response) return response;
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') return okText(`${options?.cwd ?? dir}\n`);
    if (command === 'git' && args[0] === 'symbolic-ref' && args[1] === '--short' && args[2] === 'HEAD') return okText(branchForCwd(options?.cwd));
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--path-format=absolute' && args[2] === '--git-common-dir') return okText(`${join(dir, '.git')}\n`);
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === 'refs/stash') return okText('stash123\n');
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--short=12' && args[2] === 'HEAD') return okText('abc1234def56\n');
    if (command === 'git' && args[0] === 'rev-parse' && args.includes('--verify')) return ok();
    if (command === 'git' && args[0] === 'diff' && args[1] === '--stat') return okText(' src/file.ts | 2 ++\n');
    if (command === 'git' && args[0] === 'diff' && args[1] === '--name-status') return okText('M\tsrc/file.ts\n');
    if (command === 'git' && args[0] === 'status') return ok();
    if (command === 'git' && args[0] === 'update-ref') return ok();
    if (command === 'git' && args[0] === 'stash') return okText('Saved working directory and index state\n');
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'remove') return ok();
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return okText(JSON.stringify({ pane_id: args[2] }));
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'close') return ok();
    if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') return { exitCode: 1, stdout: '', stderr: 'timeout\n' };
    if (command === 'herdr' && args[0] === 'worktree' && args[1] === 'remove') return ok();
    throw new Error(`Unexpected command: ${key}`);
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-cleanup-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('merge-plan and cleanup commands', () => {
  it('writes MERGE_DECISION.md without changing run state', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Prepare merge', now: NOW, runner });
    await writeFile(join(state.canonical_run_dir, 'REVIEW.md'), 'Approved with notes\n', 'utf8');
    await writeFile(join(state.canonical_run_dir, 'TEST_REPORT.md'), 'Tests passed\n', 'utf8');

    const result = await mergePlanRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('Wrote');
    const decision = await readFile(join(state.canonical_run_dir, 'MERGE_DECISION.md'), 'utf8');
    expect(decision).toContain('# Merge Decision');
    expect(decision).toContain(`Run: ${state.run_id}`);
    expect(decision).toContain('Approved with notes');
    expect(decision).toContain('git diff');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.status).toBe('active');
    expect(saved.state_revision).toBeUndefined();
  });

  it('reports cleanup candidates without mutating by default', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Dry cleanup', now: NOW, runner });
    state.roles.planner!.herdr_pane_id = 'planner-pane';
    await writeJsonAtomic(statePath, state);

    const result = await cleanupRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('Cleanup report');
    expect(result.text).toContain('No changes made.');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.status).toBe('active');
    expect(runner.calls).not.toContain('herdr pane close planner-pane');
  });

  it('marks a run completed and explicit --run can still inspect it', async () => {
    const runner = new RecordingRunner();
    const { state } = await createRun({ cwd: dir, goal: 'Complete cleanup', now: NOW, runner });

    const cleaned = await cleanupRun({ cwd: dir, run: state.run_id, complete: true, runner, now: NOW });
    const inspected = await cleanupRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(cleaned.state.status).toBe('completed');
    expect(inspected.text).toContain('Cleanup report');
    expect(inspected.state.status).toBe('completed');
  });

  it('never closes the lead pane and closes worker panes only when requested', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Close panes', now: NOW, runner });
    state.lead_binding.herdr_pane_id = 'lead-pane';
    state.roles.planner!.herdr_pane_id = 'planner-pane';
    await writeJsonAtomic(statePath, state);

    const result = await cleanupRun({ cwd: dir, run: state.run_id, closePanes: true, runner, now: NOW });

    expect(result.text).toContain('Closed planner pane planner-pane.');
    expect(runner.calls).not.toContain('herdr pane close lead-pane');
    expect(runner.calls).toContain('herdr pane close planner-pane');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.herdr_pane_id).toBeNull();
  });

  it('rejects conflicting lifecycle flags', async () => {
    const runner = new RecordingRunner();
    const { state } = await createRun({ cwd: dir, goal: 'Conflicting cleanup', now: NOW, runner });

    await expect(cleanupRun({ cwd: dir, run: state.run_id, complete: true, abandon: true, runner, now: NOW })).rejects.toThrow('Choose only one');
  });

  it('marks a run abandoned', async () => {
    const runner = new RecordingRunner();
    const { state } = await createRun({ cwd: dir, goal: 'Abandon cleanup', now: NOW, runner });

    const result = await cleanupRun({ cwd: dir, run: state.run_id, abandon: true, runner, now: NOW });

    expect(result.state.status).toBe('abandoned');
    expect(result.text).toContain('Marked run abandoned.');
  });

  it('writes a merge plan for an explicitly selected completed run', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Completed merge plan', now: NOW, runner });
    state.status = 'completed';
    await writeJsonAtomic(statePath, state);

    const result = await mergePlanRun({ cwd: dir, run: state.run_id, runner, now: NOW });

    expect(result.text).toContain('Wrote');
    await expect(readFile(join(state.canonical_run_dir, 'MERGE_DECISION.md'), 'utf8')).resolves.toContain('Status: completed');
  });

  it('refuses working role pane cleanup unless forced', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Working close', now: NOW, runner });
    state.roles.planner!.status = 'working';
    state.roles.planner!.herdr_pane_id = 'planner-pane';
    await writeJsonAtomic(statePath, state);

    await expect(cleanupRun({ cwd: dir, run: state.run_id, closePanes: true, runner, now: NOW })).rejects.toThrow('Refusing to close working planner pane');
  });

  it('refuses dirty worktree removal unless forced', async () => {
    const runner = new RecordingRunner({
      'git status --porcelain --untracked-files=all': okText(' M src/file.ts\n')
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Dirty removal', now: NOW, runner });
    await materializeRole(state, 'reviewer', 'git');
    await writeJsonAtomic(statePath, state);

    await expect(cleanupRun({ cwd: dir, run: state.run_id, removeWorktrees: true, runner, now: NOW })).rejects.toThrow('Refusing to remove dirty reviewer worktree');
  });

  it('uses Herdr workspace id for Herdr-provider worktree removal and never deletes branches', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Herdr removal', now: NOW, runner });
    await materializeRole(state, 'reviewer', 'herdr');
    state.roles.reviewer!.worktree_herdr_workspace_id = 'workspace-reviewer';
    await writeJsonAtomic(statePath, state);

    const result = await cleanupRun({ cwd: dir, run: state.run_id, removeWorktrees: true, runner, now: NOW });

    expect(result.text).toContain('Removed reviewer Herdr worktree workspace workspace-reviewer.');
    expect(runner.calls).toContain('herdr worktree remove --workspace workspace-reviewer');
    expect(runner.calls.some((call) => call.includes('branch -D'))).toBe(false);
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.roles.reviewer?.worktree_status).toBe('pending');
    expect(saved.roles.reviewer?.worktree_path).toBeNull();
  });

  it('falls back to git when Herdr worktree removal fails', async () => {
    const runner = new RecordingRunner({
      'herdr worktree remove --workspace workspace-reviewer': { exitCode: 1, stdout: '', stderr: 'herdr unavailable\n' }
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Fallback removal', now: NOW, runner });
    await materializeRole(state, 'reviewer', 'herdr');
    state.roles.reviewer!.worktree_herdr_workspace_id = 'workspace-reviewer';
    await writeJsonAtomic(statePath, state);

    const result = await cleanupRun({ cwd: dir, run: state.run_id, removeWorktrees: true, runner, now: NOW });

    expect(result.text).toContain('falling back to git');
    expect(result.text).toContain('Removed reviewer git worktree');
    expect(runner.calls).toContain(`git worktree remove ${state.roles.reviewer!.worktree_path}`);
  });

  it('does not mark lifecycle when worktree removal fails first', async () => {
    const runner = new RecordingRunner({
      [`git worktree remove DIR/.worktrees/pi-herd/${NOW.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-')}-lifecycle-failure/reviewer`]: { exitCode: 1, stdout: '', stderr: 'remove failed\n' }
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Lifecycle failure', now: NOW, runner });
    await materializeRole(state, 'reviewer', 'git');
    await writeJsonAtomic(statePath, state);

    await expect(cleanupRun({ cwd: dir, run: state.run_id, removeWorktrees: true, complete: true, runner, now: NOW })).rejects.toThrow('Could not remove reviewer worktree');
    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.status).toBe('active');
  });

  it('preserves dirty work before forced worktree removal', async () => {
    const runner = new RecordingRunner({
      'git status --porcelain --untracked-files=all': okText(' M src/file.ts\n')
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Forced removal', now: NOW, runner });
    await materializeRole(state, 'reviewer', 'git');
    await writeJsonAtomic(statePath, state);

    const result = await cleanupRun({ cwd: dir, run: state.run_id, removeWorktrees: true, force: true, runner, now: NOW });

    expect(result.text).toContain('Saved reviewer backup ref');
    expect(result.text).toContain('Saved reviewer dirty work stash stash123');
    expect(runner.calls).toContain(`git worktree remove --force ${state.roles.reviewer!.worktree_path}`);
  });
});

async function materializeRole(state: RunState, role: 'reviewer' | 'tester' | 'planner' | 'implementer', provider: 'git' | 'herdr'): Promise<void> {
  const worktreePath = join(dir, '.worktrees', 'pi-herd', state.run_id, role);
  await mkdir(worktreePath, { recursive: true });
  state.roles[role]!.worktree_path = worktreePath;
  state.roles[role]!.worktree_status = 'materialized';
  state.roles[role]!.worktree_provider = provider;
}

function branchForCwd(cwd: string | undefined): string {
  if (!cwd) return 'main\n';
  if (cwd.endsWith('/reviewer')) return `pi-herd/${basenameRun(cwd)}/reviewer\n`;
  if (cwd.endsWith('/tester')) return `pi-herd/${basenameRun(cwd)}/tester\n`;
  if (cwd.endsWith('/planner')) return `pi-herd/${basenameRun(cwd)}/planner\n`;
  if (cwd.endsWith('/implementer')) return `pi-herd/${basenameRun(cwd)}/impl\n`;
  return 'main\n';
}

function basenameRun(cwd: string): string {
  const parts = cwd.split('/');
  return parts[parts.length - 2] ?? '';
}

function ok(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

function okText(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}
