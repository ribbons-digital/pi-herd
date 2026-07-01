import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRun, listActiveRuns, resolveActiveRun, type RunState } from '../src/run-state.js';

const execFileAsync = promisify(execFile);

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-run-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('run state', () => {
  it('creates canonical run artifacts and default role state', async () => {
    const result = await createRun({
      cwd: dir,
      goal: 'Replace legacy auth refresh flow',
      now: new Date('2026-07-01T12:00:00.000Z')
    });

    expect(result.state.run_id).toBe('2026-07-01T12-00-00-replace-legacy-auth-refresh-flow');
    expect(result.state.run_slug).toBe('replace-legacy-auth-refresh-flow');
    expect(result.state.status).toBe('active');
    expect(result.state.canonical_run_dir).toBe(join(dir, '.pi-herd/runs', result.state.run_id));
    expect(result.state.lead_binding.harness).toBe('pi');
    expect(result.state.roles.planner?.required_artifacts).toEqual(['PLAN.md']);
    expect(result.state.roles.implementer?.source_ref).toBeUndefined();
    expect(result.state.roles.reviewer?.source_ref).toBe('pi-herd/replace-legacy-auth-refresh-flow/impl');

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

  it('fails implicit active-run resolution when multiple active runs exist', async () => {
    await createRun({ cwd: dir, goal: 'First run', now: new Date('2026-07-01T12:00:00.000Z') });
    await createRun({ cwd: dir, goal: 'Second run', now: new Date('2026-07-01T12:01:00.000Z') });

    await expect(resolveActiveRun(dir)).rejects.toThrow(/Multiple active runs found/);
  });

  it('uses the git root and current branch when invoked from a subdirectory', async () => {
    await execFileAsync('git', ['init', '-b', 'trunk'], { cwd: dir });
    await mkdir(join(dir, 'packages/app'), { recursive: true });

    const result = await createRun({ cwd: join(dir, 'packages/app'), goal: 'Nested run' });

    const root = await realpath(dir);
    expect(result.state.repo_root).toBe(root);
    expect(result.state.base_ref).toBe('trunk');
    expect(result.state.canonical_run_dir).toContain(join(root, '.pi-herd/runs'));
  });

  it('uses configured runs directory when config is present', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), 'schema_version: 1\nharness:\n  default: pi\n  profiles:\n    pi:\n      command: pi\npaths:\n  runs_dir: custom-runs\n  prompts_dir: .pi-herd/prompts\n', 'utf8');

    const result = await createRun({ cwd: dir, goal: 'Custom path' });

    expect(result.state.canonical_run_dir).toContain(join(dir, 'custom-runs'));
  });
});
