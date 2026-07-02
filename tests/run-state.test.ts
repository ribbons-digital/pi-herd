import { mkdir, mkdtemp, readFile, realpath, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRun, listActiveRuns, listRunsForInvocation, resolveActiveRun, updateRunState, type RunState } from '../src/run-state.js';

const execFileAsync = promisify(execFile);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-run-'));
  await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('run state', () => {
  it('rejects run creation outside a git repository', async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), 'pi-herd-non-git-'));
    try {
      await expect(createRun({ cwd: nonGitDir, goal: 'No git' })).rejects.toThrow(/Not inside a git repository/);
    } finally {
      await rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it('creates canonical run artifacts and default role state', async () => {
    const result = await createRun({
      cwd: dir,
      goal: 'Replace legacy auth refresh flow',
      now: new Date('2026-07-01T12:00:00.000Z')
    });

    expect(result.state.run_id).toBe('2026-07-01T12-00-00-replace-legacy-auth-refresh-flow');
    expect(result.state.run_slug).toBe('replace-legacy-auth-refresh-flow');
    expect(result.state.status).toBe('active');
    expect(result.state.canonical_run_dir).toBe(join(await realpath(dir), '.pi-herd/runs', result.state.run_id));
    expect(result.state.lead_binding.harness).toBe('pi');
    expect(result.state.roles.planner?.required_artifacts).toEqual(['PLAN.md']);
    expect(result.state.roles.implementer?.source_ref).toBeUndefined();
    expect(result.state.roles.reviewer?.source_ref).toBe('pi-herd/2026-07-01T12-00-00-replace-legacy-auth-refresh-flow/impl');

    await expect(readFile(result.requestPath, 'utf8')).resolves.toContain('Goal: Replace legacy auth refresh flow');
    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.run_id).toBe(result.state.run_id);
    await expect(readFile(join(result.state.canonical_run_dir, 'inbox', 'missing.md'), 'utf8')).rejects.toThrow();
  });

  it('uses deterministic slug suffixes when a run id would collide', async () => {
    const now = new Date('2026-07-01T12:00:00.000Z');
    const first = await createRun({ cwd: dir, goal: 'Auth refresh', now });
    const second = await createRun({ cwd: dir, goal: 'Auth refresh', now });

    expect(first.state.run_slug).toBe('auth-refresh');
    expect(second.state.run_slug).toBe('auth-refresh-2');
    expect(second.state.run_id).toBe('2026-07-01T12-00-00-auth-refresh-2');
  });

  it('creates only selected role records', async () => {
    const result = await createRun({ cwd: dir, goal: 'Plan only', roles: ['planner'] });

    expect(Object.keys(result.state.roles)).toEqual(['planner']);
  });

  it('lists and resolves active runs without considering completed runs', async () => {
    const first = await createRun({ cwd: dir, goal: 'First run', now: new Date('2026-07-01T12:00:00.000Z') });
    const second = await createRun({ cwd: dir, goal: 'Second run', now: new Date('2026-07-01T12:01:00.000Z') });
    const completed = {
      ...first.state,
      status: 'completed' as const,
      updated_at: '2026-07-01T12:02:00.000Z'
    };
    await writeFile(first.statePath, `${JSON.stringify(completed, null, 2)}\n`, 'utf8');

    await expect(listActiveRuns(dir)).resolves.toHaveLength(1);
    await expect(resolveActiveRun(dir)).resolves.toMatchObject({ run_id: second.state.run_id });
    await expect(resolveActiveRun(dir, 'latest')).resolves.toMatchObject({ run_id: second.state.run_id });
    await expect(resolveActiveRun(dir, second.state.run_slug)).resolves.toMatchObject({ run_id: second.state.run_id });
  });

  it('locks and increments state revisions for concurrent updates', async () => {
    const result = await createRun({ cwd: dir, goal: 'Concurrent state' });

    await Promise.all([
      updateRunState(result.statePath, (state) => {
        state.roles.planner!.status = 'working';
      }),
      updateRunState(result.statePath, (state) => {
        state.roles.implementer!.status = 'working';
      })
    ]);

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
    expect(saved.roles.implementer?.status).toBe('working');
    expect(saved.state_revision).toBe(2);
  });

  it('recovers stale state locks by matching owner metadata', async () => {
    const result = await createRun({ cwd: dir, goal: 'Stale state lock' });
    const lockDir = join(result.state.canonical_run_dir, '.state.lock');
    await mkdir(lockDir);
    await writeFile(join(lockDir, 'owner.json'), JSON.stringify({ pid: 12345, token: 'stale-token', created_at: '2026-07-01T00:00:00.000Z' }), 'utf8');

    await updateRunState(result.statePath, (state) => {
      state.roles.planner!.status = 'working';
    });

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
    await expect(readFile(join(lockDir, 'owner.json'), 'utf8')).rejects.toThrow();
  });

  it('recovers stale state locks with missing owner metadata', async () => {
    const result = await createRun({ cwd: dir, goal: 'Ownerless stale state lock' });
    const lockDir = join(result.state.canonical_run_dir, '.state.lock');
    await mkdir(lockDir);
    const oldDate = new Date('2026-07-01T00:00:00.000Z');
    await utimes(lockDir, oldDate, oldDate);

    await updateRunState(result.statePath, (state) => {
      state.roles.planner!.status = 'working';
    });

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('working');
    await expect(readFile(join(lockDir, 'owner.json'), 'utf8')).rejects.toThrow();
  });

  it('does not treat a fresh owner as stale because the lock directory mtime is old', async () => {
    const result = await createRun({ cwd: dir, goal: 'Fresh lock owner' });
    const lockDir = join(result.state.canonical_run_dir, '.state.lock');
    await mkdir(lockDir);
    await writeFile(join(lockDir, 'owner.json'), JSON.stringify({ pid: 12345, token: 'fresh-token', created_at: new Date().toISOString() }), 'utf8');
    const oldDate = new Date('2026-07-01T00:00:00.000Z');
    await utimes(lockDir, oldDate, oldDate);

    await expect(
      updateRunState(result.statePath, (state) => {
        state.roles.planner!.status = 'working';
      })
    ).rejects.toThrow(/Timed out waiting for run state lock/);

    await expect(readFile(join(lockDir, 'owner.json'), 'utf8')).resolves.toContain('fresh-token');
  }, 7_000);

  it('aborts state writes and preserves a fresh lock after ownership is stolen', async () => {
    const result = await createRun({ cwd: dir, goal: 'Stolen state lock' });
    const lockDir = join(result.state.canonical_run_dir, '.state.lock');

    await expect(
      updateRunState(result.statePath, (state) => {
        state.roles.planner!.status = 'working';
        rmSync(lockDir, { recursive: true, force: true });
        mkdirSync(lockDir);
        writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ pid: 12345, token: 'fresh-token', created_at: new Date().toISOString() }), 'utf8');
      })
    ).rejects.toThrow(/lock ownership was lost/);

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.planner?.status).toBe('pending');
    expect(saved.state_revision).toBeUndefined();
    await expect(readFile(join(lockDir, 'owner.json'), 'utf8')).resolves.toContain('fresh-token');
  });

  it('fails implicit active-run resolution when multiple active runs exist', async () => {
    await createRun({ cwd: dir, goal: 'First run', now: new Date('2026-07-01T12:00:00.000Z') });
    await createRun({ cwd: dir, goal: 'Second run', now: new Date('2026-07-01T12:01:00.000Z') });

    await expect(resolveActiveRun(dir)).rejects.toThrow(/Multiple active runs found/);
  });

  it('discovers runs from a git worktree through git-common-dir', async () => {
    const result = await createRun({ cwd: dir, goal: 'Common dir run' });
    await writeFile(join(dir, 'README.md'), 'hello\n', 'utf8');
    await execFileAsync('git', ['add', 'README.md'], { cwd: dir });
    await execFileAsync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'init'], { cwd: dir });
    const linked = join(dir, '..', `${basename(dir)}-linked`);
    try {
      await execFileAsync('git', ['worktree', 'add', '-b', 'linked', linked], { cwd: dir });
      await expect(listRunsForInvocation(linked)).resolves.toMatchObject([{ run_id: result.state.run_id }]);
    } finally {
      await rm(linked, { recursive: true, force: true });
    }
  });

  it('uses the git root and current branch when invoked from a subdirectory', async () => {
    await execFileAsync('git', ['checkout', '-b', 'trunk'], { cwd: dir });
    await mkdir(join(dir, 'packages/app'), { recursive: true });

    const result = await createRun({ cwd: join(dir, 'packages/app'), goal: 'Nested run' });

    const root = await realpath(dir);
    expect(result.state.repo_root).toBe(root);
    expect(result.state.base_ref).toBe('trunk');
    expect(result.state.canonical_run_dir).toContain(join(root, '.pi-herd/runs'));
  });

  it('uses configured runs directory when config is present', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir('custom-runs'), 'utf8');

    const result = await createRun({ cwd: dir, goal: 'Custom path' });

    expect(result.state.canonical_run_dir).toContain(join(dir, 'custom-runs'));
  });

  it('rejects an absolute configured runs directory', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir(join(dir, 'outside-runs')), 'utf8');

    await expect(createRun({ cwd: dir, goal: 'Bad absolute path' })).rejects.toThrow(/repository-relative path/);
  });

  it('rejects a configured runs directory that escapes the repository', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir('../outside-runs'), 'utf8');

    await expect(createRun({ cwd: dir, goal: 'Bad parent path' })).rejects.toThrow(/repository root/);
    await expect(listActiveRuns(dir)).rejects.toThrow(/repository root/);
  });

  it('rejects a configured runs directory that traverses a symlink', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await mkdir(join(dir, 'outside-runs-target'));
    await symlink(join(dir, 'outside-runs-target'), join(dir, '.pi-herd/runs-link'));
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir('.pi-herd/runs-link'), 'utf8');

    await expect(createRun({ cwd: dir, goal: 'Bad symlink path' })).rejects.toThrow(/symbolic links/);
  });
});

function configWithRunsDir(runsDir: string): string {
  return `schema_version: 1\nharness:\n  default: pi\n  profiles:\n    pi:\n      command: pi\npaths:\n  runs_dir: ${JSON.stringify(runsDir)}\n  prompts_dir: .pi-herd/prompts\n`;
}
