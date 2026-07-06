import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { diffRun, refreshRole } from '../src/refresh.js';
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
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--path-format=absolute' && args[2] === '--git-common-dir') return okText(`${join(dir, '.git')}\n`);
    if (command === 'git' && args[0] === 'symbolic-ref') return okText(branchForCwd(options?.cwd));
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--verify' && args[2] === 'refs/stash') return okText('stash123\n');
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--short=12' && args[2] === 'HEAD') return okText('abc1234def56\n');
    if (command === 'git' && args[0] === 'rev-parse' && args.includes('--verify')) return ok();
    if (command === 'git' && args[0] === 'rev-list' && args[1] === '--count') return okText('0\n');
    if (command === 'git' && args[0] === 'log' && args[1] === '--oneline') return ok();
    if (command === 'git' && args[0] === 'status') return ok();
    if (command === 'git' && args[0] === 'show-ref') return { exitCode: 1, stdout: '', stderr: '' };
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'prune') return ok();
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'add') return ok();
    if (command === 'git' && args[0] === 'update-ref') return ok();
    if (command === 'git' && args[0] === 'stash') return okText('Saved working directory and index state\n');
    if (command === 'git' && args[0] === 'reset') return okText('HEAD is now at abc impl\n');
    if (command === 'git' && args[0] === 'clean') return ok();
    if (command === 'git' && args[0] === 'diff' && args[1] === '--stat') return okText(' src/file.ts | 2 ++\n');
    if (command === 'git' && args[0] === 'diff' && args[1] === '--name-status') return okText('M\tsrc/file.ts\n');
    if (command === 'herdr' && args[0] === 'worktree') {
      const path = args[args.indexOf('--path') + 1];
      const branch = args[args.indexOf('--branch') + 1];
      return okText(JSON.stringify({ workspace_id: 'workspace-1', path, branch }));
    }
    throw new Error(`Unexpected command: ${key}`);
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-refresh-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('refresh and diff commands', () => {
  it('materializes and refreshes a pending reviewer worktree from the implementation branch', async () => {
    const runner = new RecordingRunner();
    const { state } = await createRun({ cwd: dir, goal: 'Review changes', now: NOW, runner });

    const result = await refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner });

    expect(result.text).toContain('Refreshed reviewer from');
    expect(result.text).toContain('Materialized reviewer worktree');
    expect(runner.calls).toContain(`git reset --hard ${state.roles.implementer!.branch}`);
    const saved = JSON.parse(await readFile(join(state.canonical_run_dir, 'state.json'), 'utf8')) as RunState;
    expect(saved.roles.reviewer?.worktree_status).toBe('materialized');
  });

  it('refuses to refresh a dirty reviewer worktree without force', async () => {
    const runner = new RecordingRunner({
      'git status --porcelain --untracked-files=all': okText(' M src/file.ts\n?? scratch.md\n')
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Dirty review', now: NOW, runner });
    const worktreePath = expectedRoleWorktreePath(state, 'reviewer');
    await mkdir(worktreePath, { recursive: true });
    state.roles.reviewer!.worktree_status = 'materialized';
    state.roles.reviewer!.worktree_path = worktreePath;
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow('Refusing to refresh dirty reviewer worktree');
  });

  it('refuses to refresh a reviewer worktree with committed changes without force', async () => {
    const { runner, state, statePath } = await createMaterializedRun('Committed review');
    const branch = state.roles.implementer!.branch;
    runner.responses[`git rev-list --count ${branch}..HEAD`] = okText('2\n');
    runner.responses[`git log --oneline --max-count=80 ${branch}..HEAD`] = okText('abc1234 review fix\ndef5678 test evidence\n');
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow(
      `Refusing to refresh reviewer worktree with 2 committed change(s) not in ${branch}`
    );
    expect(runner.calls).not.toContain(`git reset --hard ${branch}`);
  });

  it('reuses an existing canonical role worktree when state has not recorded it', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Reuse canonical worktree', now: NOW, runner });
    const worktreePath = expectedRoleWorktreePath(state, 'reviewer');
    await mkdir(worktreePath, { recursive: true });
    state.roles.reviewer!.worktree_status = 'pending';
    state.roles.reviewer!.worktree_path = null;
    await writeJsonAtomic(statePath, state);

    const result = await refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner });

    expect(result.text).toContain(`Reused existing reviewer worktree at ${worktreePath}.`);
    expect(runner.calls.some((call) => call.startsWith('git worktree add'))).toBe(false);
    expect(runner.calls.some((call) => call.startsWith('herdr worktree create'))).toBe(false);
    expect(runner.calls).toContain(`git reset --hard ${state.roles.implementer!.branch}`);
  });

  it('does not persist an unvalidated canonical worktree path', async () => {
    const runner = new RecordingRunner({
      'git symbolic-ref --short HEAD': okText('main\n')
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Invalid canonical worktree', now: NOW, runner });
    const worktreePath = expectedRoleWorktreePath(state, 'reviewer');
    await mkdir(worktreePath, { recursive: true });
    state.roles.reviewer!.worktree_status = 'pending';
    state.roles.reviewer!.worktree_path = null;
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow(
      `Refusing to refresh reviewer worktree because it is on main instead of ${state.roles.reviewer!.branch}`
    );

    const saved = JSON.parse(await readFile(join(state.canonical_run_dir, 'state.json'), 'utf8')) as RunState;
    expect(saved.roles.reviewer?.worktree_status).toBe('pending');
    expect(saved.roles.reviewer?.worktree_path).toBeNull();
    expect(runner.calls).not.toContain(`git reset --hard ${state.roles.implementer!.branch}`);
  });

  it('force refresh resets and cleans a reviewer worktree with committed changes', async () => {
    const { runner, state, statePath } = await createMaterializedRun('Force committed review');
    const branch = state.roles.implementer!.branch;
    runner.responses[`git rev-list --count ${branch}..HEAD`] = okText('1\n');
    runner.responses[`git log --oneline --max-count=80 ${branch}..HEAD`] = okText('abc1234 review fix\n');
    await writeJsonAtomic(statePath, state);

    const result = await refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', force: true, runner });

    expect(result.text).toContain('Force refreshing reviewer worktree with 1 committed change(s)');
    expect(result.text).toContain('abc1234 review fix');
    expect(result.text).toContain(`Saved reviewer backup ref refs/pi-herd/backup/reviewer/${state.run_id}/abc1234def56-`);
    const backupCalls = runner.calls.filter((call) => call.startsWith(`git update-ref refs/pi-herd/backup/reviewer/${state.run_id}/abc1234def56-`));
    expect(backupCalls).toHaveLength(1);
    expect(backupCalls[0]).toMatch(/^git update-ref refs\/pi-herd\/backup\/reviewer\/[^/]+\/abc1234def56-[0-9a-f-]+ HEAD$/);
    expect(runner.calls).toContain(`git reset --hard ${branch}`);
    expect(runner.calls).toContain('git clean -fd');
  });

  it('uses a fresh backup ref for each forced refresh', async () => {
    const { runner, state, statePath } = await createMaterializedRun('Repeated force refresh');
    await writeJsonAtomic(statePath, state);

    await refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', force: true, runner });
    await refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', force: true, runner });

    const backupCalls = runner.calls.filter((call) => call.startsWith(`git update-ref refs/pi-herd/backup/reviewer/${state.run_id}/abc1234def56-`));
    expect(backupCalls).toHaveLength(2);
    expect(new Set(backupCalls).size).toBe(2);
  });

  it('refuses to refresh a working role without force', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Working review', now: NOW, runner });
    state.roles.reviewer!.status = 'working';
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow('Refusing to refresh reviewer while it is working');
  });

  it('force refresh stashes dirty tester work before resetting and cleaning', async () => {
    const runner = new RecordingRunner({
      'git status --porcelain --untracked-files=all': okText('?? scratch.md\n')
    });
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Force test refresh', now: NOW, runner });
    const worktreePath = expectedRoleWorktreePath(state, 'tester');
    await mkdir(worktreePath, { recursive: true });
    state.roles.tester!.worktree_status = 'materialized';
    state.roles.tester!.worktree_path = worktreePath;
    await writeJsonAtomic(statePath, state);

    const result = await refreshRole({ cwd: dir, run: state.run_id, role: 'tester', force: true, runner });

    expect(result.text).toContain('Force refreshing dirty tester worktree');
    expect(result.text).toContain('Saved tester dirty work stash stash123 (refs/stash).');
    const stashIndex = runner.calls.indexOf(`git stash push --include-untracked --message pi-herd tester refresh backup ${state.run_id}`);
    const resetIndex = runner.calls.indexOf(`git reset --hard ${state.roles.implementer!.branch}`);
    expect(stashIndex).toBeGreaterThanOrEqual(0);
    expect(runner.calls).toContain('git rev-parse --verify refs/stash');
    expect(resetIndex).toBeGreaterThan(stashIndex);
    expect(runner.calls).toContain('git clean -fd');
  });

  it('refuses to refresh a worktree stored at an unexpected path', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Unexpected path', now: NOW, runner });
    const worktreePath = join(dir, 'other-checkout');
    await mkdir(worktreePath, { recursive: true });
    state.roles.reviewer!.worktree_status = 'materialized';
    state.roles.reviewer!.worktree_path = worktreePath;
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', force: true, runner })).rejects.toThrow(
      'Refusing to refresh reviewer worktree at unexpected path'
    );
    expect(runner.calls).not.toContain(`git reset --hard ${state.roles.implementer!.branch}`);
  });

  it('prunes stale worktree registrations before recreating a missing role worktree', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Stale worktree registration', now: NOW, runner });
    const worktreePath = expectedRoleWorktreePath(state, 'reviewer');
    state.roles.reviewer!.worktree_status = 'materialized';
    state.roles.reviewer!.worktree_path = worktreePath;
    runner.responses[`git show-ref --verify --quiet refs/heads/${state.roles.reviewer!.branch}`] = ok();
    await writeJsonAtomic(statePath, state);

    const result = await refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner });

    expect(result.text).toContain('Stored reviewer worktree path is missing; recreating it.');
    expect(result.text).toContain(`Recreated reviewer worktree at ${worktreePath}.`);
    const pruneIndex = runner.calls.indexOf('git worktree prune --expire now');
    const addIndex = runner.calls.indexOf(`git worktree add ${worktreePath} ${state.roles.reviewer!.branch}`);
    const resetIndex = runner.calls.indexOf(`git reset --hard ${state.roles.implementer!.branch}`);
    expect(pruneIndex).toBeGreaterThanOrEqual(0);
    expect(addIndex).toBeGreaterThan(pruneIndex);
    expect(resetIndex).toBeGreaterThan(addIndex);
  });

  it('refuses to recreate a missing worktree through a symlinked path component', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Symlinked worktrees', now: NOW, runner });
    const outside = join(dir, 'outside-worktrees');
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(dir, '.worktrees'), 'dir');
    state.roles.reviewer!.worktree_status = 'materialized';
    state.roles.reviewer!.worktree_path = expectedRoleWorktreePath(state, 'reviewer');
    runner.responses[`git show-ref --verify --quiet refs/heads/${state.roles.reviewer!.branch}`] = ok();
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow(
      'Worktree path must not include symbolic links'
    );
    expect(runner.calls.some((call) => call.startsWith('git worktree add'))).toBe(false);
  });

  it('refuses to refresh an existing worktree through a symlinked path component', async () => {
    const runner = new RecordingRunner();
    const { state, statePath } = await createRun({ cwd: dir, goal: 'Existing symlinked worktree', now: NOW, runner });
    const outside = join(dir, 'outside-worktrees');
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(dir, '.worktrees'), 'dir');
    const worktreePath = expectedRoleWorktreePath(state, 'reviewer');
    await mkdir(worktreePath, { recursive: true });
    state.roles.reviewer!.worktree_status = 'materialized';
    state.roles.reviewer!.worktree_path = worktreePath;
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', force: true, runner })).rejects.toThrow(
      'Worktree path must not include symbolic links'
    );
    expect(runner.calls).not.toContain(`git reset --hard ${state.roles.implementer!.branch}`);
  });

  it('refuses to refresh a worktree from a different repository', async () => {
    const { runner, state, statePath } = await createMaterializedRun('Wrong repository');
    runner.responses['git rev-parse --path-format=absolute --git-common-dir'] = (_command, _args, options) => {
      return okText(options?.cwd === state.repo_root ? `${join(dir, '.git')}\n` : `${join(dir, 'other-repo', '.git')}\n`);
    };
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow(
      'Refusing to refresh reviewer worktree because it does not belong to the run repository'
    );
    expect(runner.calls).not.toContain(`git reset --hard ${state.roles.implementer!.branch}`);
  });

  it('refuses to refresh a worktree checked out on the wrong branch', async () => {
    const { runner, state, statePath } = await createMaterializedRun('Wrong branch');
    runner.responses['git symbolic-ref --short HEAD'] = okText('main\n');
    await writeJsonAtomic(statePath, state);

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'reviewer', runner })).rejects.toThrow(
      `Refusing to refresh reviewer worktree because it is on main instead of ${state.roles.reviewer!.branch}`
    );
    expect(runner.calls).not.toContain(`git reset --hard ${state.roles.implementer!.branch}`);
  });

  it('refuses refresh for non-review roles', async () => {
    const runner = new RecordingRunner();
    const { state } = await createRun({ cwd: dir, goal: 'Bad refresh', now: NOW, runner });

    await expect(refreshRole({ cwd: dir, run: state.run_id, role: 'planner', runner })).rejects.toThrow('Refresh only supports reviewer or tester roles');
  });

  it('shows implementation diff using a merge-base range', async () => {
    const runner = new RecordingRunner();
    const { state } = await createRun({ cwd: dir, goal: 'Show diff', now: NOW, runner });

    const result = await diffRun({ cwd: dir, run: state.run_id, runner });

    expect(result.text).toContain(`Range: main...${state.roles.implementer!.branch}`);
    expect(result.text).toContain('src/file.ts | 2 ++');
    expect(result.text).toContain('M\tsrc/file.ts');
    expect(result.text).not.toContain('## Source implementer');
    expect(result.text).not.toContain('Branch:');
  });

  it('renders one source section per worktree-writing role when multiple sources are selected', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), SOURCE_ROLE_CONFIG, 'utf8');
    const runId = '2026-07-01T12-00-00-diff-source-fanout';
    const runner = new RecordingRunner({
      [`git diff --stat main...pi-herd/${runId}/impl`]: okText(' impl.ts | 1 +\n'),
      [`git diff --name-status main...pi-herd/${runId}/impl`]: okText('M\timpl.ts\n'),
      [`git diff --stat main...pi-herd/${runId}/source_assistant`]: okText(' source.ts | 2 ++\n'),
      [`git diff --name-status main...pi-herd/${runId}/source_assistant`]: okText('A\tsource.ts\n')
    });
    const { state } = await createRun({ cwd: dir, goal: 'Diff source fanout', now: NOW, runner });

    const result = await diffRun({ cwd: dir, run: state.run_id, runner });

    expect(result.text).toContain('## Source implementer');
    expect(result.text).toContain(`Branch: pi-herd/${runId}/impl`);
    expect(result.text).toContain(`Range: main...pi-herd/${runId}/impl`);
    expect(result.text).toContain('impl.ts | 1 +');
    expect(result.text).toContain('M\timpl.ts');
    expect(result.text).toContain('## Source source_assistant');
    expect(result.text).toContain(`Branch: pi-herd/${runId}/source_assistant`);
    expect(result.text).toContain(`Range: main...pi-herd/${runId}/source_assistant`);
    expect(result.text).toContain('source.ts | 2 ++');
    expect(result.text).toContain('A\tsource.ts');
  });
});

async function createMaterializedRun(goal: string) {
  const runner = new RecordingRunner();
  const { state, statePath } = await createRun({ cwd: dir, goal, now: NOW, runner });
  const worktreePath = expectedRoleWorktreePath(state, 'reviewer');
  await mkdir(worktreePath, { recursive: true });
  state.roles.reviewer!.worktree_status = 'materialized';
  state.roles.reviewer!.worktree_path = worktreePath;
  return { runner, state, statePath };
}

const SOURCE_ROLE_CONFIG = `schema_version: 1\nharness:\n  default: pi\n  profiles:\n    pi:\n      command: pi\npaths:\n  runs_dir: .pi-herd/runs\n  prompts_dir: .pi-herd/prompts\nroles:\n  default:\n    - implementer\n    - source_assistant\n  definitions:\n    implementer:\n      display_name: Implementer\n      expected_writes: worktree\n      required_artifacts:\n        - IMPLEMENTATION_NOTES.md\n    source_assistant:\n      display_name: Source Assistant\n      expected_writes: worktree\n      required_artifacts:\n        - SOURCE_NOTES.md\n`;

function expectedRoleWorktreePath(state: RunState, role: 'reviewer' | 'tester'): string {
  return join(dir, '.worktrees', 'pi-herd', state.run_id, role);
}

function branchForCwd(cwd: string | undefined): string {
  if (!cwd) return 'main\n';
  const role = basename(cwd);
  if (role !== 'reviewer' && role !== 'tester') return 'main\n';
  const runId = basename(dirname(cwd));
  return `pi-herd/${runId}/${role}\n`;
}

function ok(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

function okText(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' };
}
