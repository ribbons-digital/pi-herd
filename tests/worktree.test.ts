import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nodeCommandRunner } from '../src/command-runner.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRun, resolveActiveRun, type RunState } from '../src/run-state.js';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';

let dir: string;
let extraDirs: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-worktree-'));
  extraDirs = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await Promise.all(extraDirs.map((extraDir) => rm(extraDir, { recursive: true, force: true })));
});

class HerdrFailingGitRunner implements CommandRunner {
  async run(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult> {
    if (command === 'herdr') {
      return { exitCode: null, stdout: '', stderr: '', error: Object.assign(new Error('missing herdr'), { code: 'ENOENT' }) };
    }
    return nodeCommandRunner.run(command, args, options);
  }
}

class RecordingRunner implements CommandRunner {
  calls: string[] = [];

  constructor(private readonly responses: Record<string, CommandResult>) {}

  async run(command: string, args: string[], options?: { cwd?: string }): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(`${options?.cwd ?? ''}$ ${key}`);
    if (this.responses[key]) {
      return this.responses[key];
    }
    if (command === 'git' && args[0] === 'show-ref') {
      return { exitCode: 1, stdout: '', stderr: '' };
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  }
}

describe('worktree orchestration', () => {
  it('creates implementer worktree through Herdr first and persists state', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/add-worktrees/impl --base main --path DIR/.worktrees/pi-herd/add-worktrees/implementer --label pi-herd add-worktrees implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123', checkout_path: join(dir, '.worktrees/pi-herd/add-worktrees/implementer') }),
        stderr: ''
      }
    }));

    const result = await createRun({
      cwd: dir,
      goal: 'Add worktrees',
      now: new Date('2026-07-01T12:00:00.000Z'),
      withWorktrees: true,
      runner
    });

    expect(result.worktrees).toEqual([{
      role: 'implementer',
      branch: 'pi-herd/add-worktrees/impl',
      path: join(dir, '.worktrees/pi-herd/add-worktrees/implementer'),
      provider: 'herdr',
      herdr_workspace_id: 'workspace-123'
    }]);
    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
    expect(result.state.roles.implementer?.herdr_workspace_id).toBe('workspace-123');
    expect(result.state.roles.reviewer?.worktree_status).toBe('pending');
    expect(runner.calls.some((call) => call.includes('git worktree add'))).toBe(false);

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.implementer?.worktree_status).toBe('materialized');
  });

  it('falls back to git worktree when Herdr creation fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/git-fallback/impl --base main --path DIR/.worktrees/pi-herd/git-fallback/implementer --label pi-herd git-fallback implementer --no-focus --json': {
        exitCode: 1,
        stdout: '',
        stderr: 'herdr unavailable\n'
      },
      'git worktree add -b pi-herd/git-fallback/impl DIR/.worktrees/pi-herd/git-fallback/implementer main': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    const result = await createRun({ cwd: dir, goal: 'Git fallback', withWorktrees: true, runner });

    expect(result.worktrees[0]).toMatchObject({ role: 'implementer', provider: 'git', herdr_workspace_id: null });
    expect(runner.calls.some((call) => call.includes('git worktree add -b pi-herd/git-fallback/impl'))).toBe(true);
  });

  it('optionally creates a planner worktree without materializing reviewer or tester', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/planner-too/impl --base main --path DIR/.worktrees/pi-herd/planner-too/implementer --label pi-herd planner-too implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/planner-too/implementer')),
      'herdr worktree create --cwd DIR --branch pi-herd/planner-too/planner --base main --path DIR/.worktrees/pi-herd/planner-too/planner --label pi-herd planner-too planner --no-focus --json': herdrSuccess('planner-ws', join(dir, '.worktrees/pi-herd/planner-too/planner'))
    }));

    const result = await createRun({ cwd: dir, goal: 'Planner too', withWorktrees: true, plannerWorktree: true, runner });

    expect(result.worktrees.map((worktree) => worktree.role)).toEqual(['implementer', 'planner']);
    expect(result.state.roles.planner?.worktree_status).toBe('materialized');
    expect(result.state.roles.reviewer?.worktree_status).toBe('pending');
    expect(result.state.roles.tester?.worktree_status).toBe('pending');
  });

  it('refuses dirty repositories before creating worktrees', async () => {
    const runner = new RecordingRunner(baseResponses({
      'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': {
        exitCode: 0,
        stdout: ' M src/index.ts\n',
        stderr: ''
      }
    }));

    await expect(createRun({ cwd: dir, goal: 'Dirty repo', withWorktrees: true, runner })).rejects.toThrow(/uncommitted changes/);
  });

  it.each([
    '.pi-herd/config.yaml',
    '.pi-herd/prompts/implementer.md'
  ])('refuses uncommitted %s changes before creating worktrees', async (changedPath) => {
    const runner = new RecordingRunner(baseResponses({
      'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': {
        exitCode: 0,
        stdout: `?? ${changedPath}\n`,
        stderr: ''
      }
    }));

    await expect(createRun({ cwd: dir, goal: 'Dirty pi herd file', withWorktrees: true, runner })).rejects.toThrow(/uncommitted changes/);
  });

  it('creates a real git fallback worktree in a temporary repository', async () => {
    await nodeCommandRunner.run('git', ['init', '-b', 'main'], { cwd: dir });
    await nodeCommandRunner.run('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await nodeCommandRunner.run('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await writeFile(join(dir, 'README.md'), 'hello\n', 'utf8');
    await nodeCommandRunner.run('git', ['add', 'README.md'], { cwd: dir });
    await nodeCommandRunner.run('git', ['commit', '-m', 'init'], { cwd: dir });
    const runner = new HerdrFailingGitRunner();

    const result = await createRun({ cwd: dir, goal: 'Real git fallback', withWorktrees: true, runner });

    expect(result.worktrees[0]?.provider).toBe('git');
    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
    await expect(readFile(join(result.state.roles.implementer?.worktree_path ?? '', 'README.md'), 'utf8')).resolves.toBe('hello\n');
  });

  it('ignores custom run artifacts during the clean check', async () => {
    await writeFile(join(dir, '.gitignore'), '', 'utf8').catch(() => undefined);
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir('custom-runs'), 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees :!custom-runs': { exitCode: 0, stdout: '', stderr: '' },
      'herdr worktree create --cwd DIR --branch pi-herd/custom-runs/impl --base main --path DIR/.worktrees/pi-herd/custom-runs/implementer --label pi-herd custom-runs implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/custom-runs/implementer'))
    }));

    const result = await createRun({ cwd: dir, goal: 'Custom runs', withWorktrees: true, runner });

    expect(result.state.canonical_run_dir).toContain(join(dir, 'custom-runs'));
    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
  });

  it('excludes the canonical run directory when runs_dir is the repository root', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir('.'), 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/root-runs/impl --base main --path DIR/.worktrees/pi-herd/root-runs/implementer --label pi-herd root-runs implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/root-runs/implementer'))
    }));

    const result = await createRun({ cwd: dir, goal: 'Root runs', now: new Date('2026-07-01T12:00:00.000Z'), withWorktrees: true, runner });

    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
    expect(runner.calls).toContain(`${dir}$ git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees :!2026-07-01T12-00-00-root-runs`);
  });

  it('refuses an existing worktree path before creation', async () => {
    await mkdir(join(dir, '.worktrees/pi-herd/path-exists/implementer'), { recursive: true });
    const runner = new RecordingRunner(baseResponses({}));

    await expect(createRun({ cwd: dir, goal: 'Path exists', withWorktrees: true, runner })).rejects.toThrow(/Worktree path already exists/);
  });

  it('refuses symlink components in worktree paths before provider creation', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pi-herd-worktree-target-'));
    extraDirs.push(outside);
    await symlink(outside, join(dir, '.worktrees'));
    const runner = new RecordingRunner(baseResponses({}));

    await expect(createRun({ cwd: dir, goal: 'Symlink worktree root', withWorktrees: true, runner })).rejects.toThrow(/Worktree path must not include symbolic links/);
    expect(runner.calls.some((call) => call.includes('herdr worktree create'))).toBe(false);
    expect(runner.calls.some((call) => call.includes('git worktree add'))).toBe(false);
  });

  it('falls back to git when Herdr omits required metadata', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/incomplete-herdr/impl --base main --path DIR/.worktrees/pi-herd/incomplete-herdr/implementer --label pi-herd incomplete-herdr implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({ checkout_path: join(dir, '.worktrees/pi-herd/incomplete-herdr/implementer') }),
        stderr: ''
      },
      'git worktree add -b pi-herd/incomplete-herdr/impl DIR/.worktrees/pi-herd/incomplete-herdr/implementer main': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    const result = await createRun({ cwd: dir, goal: 'Incomplete Herdr', withWorktrees: true, runner });

    expect(result.worktrees[0]).toMatchObject({ role: 'implementer', provider: 'git', herdr_workspace_id: null });
    expect(result.state.roles.implementer?.herdr_workspace_id).toBeNull();
  });

  it('falls back to git when Herdr reports the wrong checkout path', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/wrong-path/impl --base main --path DIR/.worktrees/pi-herd/wrong-path/implementer --label pi-herd wrong-path implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123', checkout_path: join(dir, '.worktrees/pi-herd/other/implementer') }),
        stderr: ''
      },
      'git worktree add -b pi-herd/wrong-path/impl DIR/.worktrees/pi-herd/wrong-path/implementer main': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    const result = await createRun({ cwd: dir, goal: 'Wrong path', withWorktrees: true, runner });

    expect(result.worktrees[0]).toMatchObject({
      role: 'implementer',
      path: join(dir, '.worktrees/pi-herd/wrong-path/implementer'),
      provider: 'git',
      herdr_workspace_id: null
    });
  });

  it('falls back to git when Herdr reports the wrong branch', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/wrong-branch/impl --base main --path DIR/.worktrees/pi-herd/wrong-branch/implementer --label pi-herd wrong-branch implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123', checkout_path: join(dir, '.worktrees/pi-herd/wrong-branch/implementer'), branch: 'pi-herd/other/impl' }),
        stderr: ''
      },
      'git worktree add -b pi-herd/wrong-branch/impl DIR/.worktrees/pi-herd/wrong-branch/implementer main': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    const result = await createRun({ cwd: dir, goal: 'Wrong branch', withWorktrees: true, runner });

    expect(result.worktrees[0]).toMatchObject({
      role: 'implementer',
      branch: 'pi-herd/wrong-branch/impl',
      provider: 'git',
      herdr_workspace_id: null
    });
  });

  it('reports unusable Herdr metadata when git fallback also fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/bad-herdr/impl --base main --path DIR/.worktrees/pi-herd/bad-herdr/implementer --label pi-herd bad-herdr implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123' }),
        stderr: ''
      },
      'git worktree add -b pi-herd/bad-herdr/impl DIR/.worktrees/pi-herd/bad-herdr/implementer main': {
        exitCode: 128,
        stdout: '',
        stderr: 'git failed\n'
      }
    }));

    await expect(createRun({ cwd: dir, goal: 'Bad Herdr', withWorktrees: true, runner })).rejects.toThrow(/Herdr: herdr worktree create returned unusable JSON metadata\. Git: git failed/);
  });

  it('reports both Herdr and git failures when no provider can create a worktree', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/no-provider/impl --base main --path DIR/.worktrees/pi-herd/no-provider/implementer --label pi-herd no-provider implementer --no-focus --json': {
        exitCode: 1,
        stdout: '',
        stderr: 'herdr failed\n'
      },
      'git worktree add -b pi-herd/no-provider/impl DIR/.worktrees/pi-herd/no-provider/implementer main': {
        exitCode: 128,
        stdout: '',
        stderr: 'git failed\n'
      }
    }));

    await expect(createRun({ cwd: dir, goal: 'No provider', withWorktrees: true, runner })).rejects.toThrow(/Herdr: herdr failed\. Git: git failed/);
  });

  it('persists successful materializations when a later worktree fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/partial-failure/impl --base main --path DIR/.worktrees/pi-herd/partial-failure/implementer --label pi-herd partial-failure implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/partial-failure/implementer')),
      'git show-ref --verify --quiet refs/heads/pi-herd/partial-failure/planner': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    let statePath = '';
    try {
      await createRun({ cwd: dir, goal: 'Partial failure', withWorktrees: true, plannerWorktree: true, runner });
    } catch (error) {
      const runs = await readdir(join(dir, '.pi-herd/runs'));
      statePath = join(dir, '.pi-herd/runs', runs[0] ?? '', 'state.json');
      expect(error).toBeInstanceOf(Error);
    }

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as RunState;
    expect(saved.status).toBe('failed');
    expect(saved.roles.implementer?.worktree_status).toBe('materialized');
    expect(saved.roles.planner?.worktree_status).toBe('pending');
  });

  it('marks the run failed when first worktree materialization fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/first-failure/impl --base main --path DIR/.worktrees/pi-herd/first-failure/implementer --label pi-herd first-failure implementer --no-focus --json': {
        exitCode: 1,
        stdout: '',
        stderr: 'herdr failed\n'
      },
      'git worktree add -b pi-herd/first-failure/impl DIR/.worktrees/pi-herd/first-failure/implementer main': {
        exitCode: 128,
        stdout: '',
        stderr: 'git failed\n'
      }
    }));

    await expect(createRun({ cwd: dir, goal: 'First failure', withWorktrees: true, runner })).rejects.toThrow(/Could not create worktree/);

    const runs = await readdir(join(dir, '.pi-herd/runs'));
    const saved = JSON.parse(await readFile(join(dir, '.pi-herd/runs', runs[0] ?? '', 'state.json'), 'utf8')) as RunState;
    expect(saved.status).toBe('failed');
    expect(saved.roles.implementer?.worktree_status).toBe('pending');
    await expect(resolveActiveRun(dir, undefined, undefined, runner)).rejects.toThrow(/No active runs found/);
  });

  it('refuses existing worktree branches before creation', async () => {
    const runner = new RecordingRunner(baseResponses({
      'git show-ref --verify --quiet refs/heads/pi-herd/branch-exists/impl': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    await expect(createRun({ cwd: dir, goal: 'Branch exists', withWorktrees: true, runner })).rejects.toThrow(/Branch already exists/);
  });
});

function configWithRunsDir(runsDir: string): string {
  return `schema_version: 1\nharness:\n  default: pi\n  profiles:\n    pi:\n      command: pi\npaths:\n  runs_dir: ${JSON.stringify(runsDir)}\n  prompts_dir: .pi-herd/prompts\n`;
}

function baseResponses(overrides: Record<string, CommandResult>): Record<string, CommandResult> {
  const normalized: Record<string, CommandResult> = Object.create(null) as Record<string, CommandResult>;
  const responses = {
    'git rev-parse --show-toplevel': { exitCode: 0, stdout: `${dir}\n`, stderr: '' },
    'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' },
    'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': { exitCode: 0, stdout: '', stderr: '' },
    ...overrides
  };
  for (const [key, value] of Object.entries(responses)) {
    normalized[key.replaceAll('DIR', dir)] = value;
  }
  return normalized;
}

function herdrSuccess(workspaceId: string, checkoutPath: string): CommandResult {
  return {
    exitCode: 0,
    stdout: JSON.stringify({ workspace_id: workspaceId, checkout_path: checkoutPath }),
    stderr: ''
  };
}
