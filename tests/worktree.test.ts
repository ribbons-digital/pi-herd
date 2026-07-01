import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nodeCommandRunner } from '../src/command-runner.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRun, resolveActiveRun, type RunState } from '../src/run-state.js';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';

let dir: string;
let extraDirs: string[];

const RUN_NOW = new Date('2026-07-01T12:00:00.000Z');
const RUN_PREFIX = '2026-07-01T12-00-00';

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
  options: Array<{ command: string; args: string[]; cwd?: string; timeoutMs?: number }> = [];

  constructor(private readonly responses: Record<string, CommandResult>) {}

  async run(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(`${options?.cwd ?? ''}$ ${key}`);
    this.options.push({ command, args, cwd: options?.cwd, timeoutMs: options?.timeoutMs });
    if (this.responses[key]) {
      return this.responses[key];
    }
    if (command === 'git' && args[0] === 'show-ref') {
      return { exitCode: 1, stdout: '', stderr: '' };
    }
    throw new Error(`Unexpected command: ${key}`);
  }
}

describe('worktree orchestration', () => {
  it('creates implementer worktree through Herdr first and persists state', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-add-worktrees/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-add-worktrees/implementer --label pi-herd add-worktrees implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123', checkout_path: join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-add-worktrees/implementer'), branch: 'pi-herd/2026-07-01T12-00-00-add-worktrees/impl' }),
        stderr: ''
      }
    }));

    const result = await createRun({
      cwd: dir,
      now: RUN_NOW,
      goal: 'Add worktrees',
      withWorktrees: true,
      runner
    });

    expect(result.worktrees).toEqual([{
      role: 'implementer',
      branch: 'pi-herd/2026-07-01T12-00-00-add-worktrees/impl',
      path: join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-add-worktrees/implementer'),
      provider: 'herdr',
      herdr_workspace_id: 'workspace-123'
    }]);
    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
    expect(result.state.roles.implementer?.worktree_provider).toBe('herdr');
    expect(result.state.roles.implementer?.herdr_workspace_id).toBe('workspace-123');
    expect(result.state.roles.reviewer?.worktree_status).toBe('pending');
    expect(runner.calls.some((call) => call.includes('git worktree add'))).toBe(false);

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.implementer?.worktree_status).toBe('materialized');
    expect(saved.roles.implementer?.worktree_provider).toBe('herdr');
  });

  it('uses run ids for worktree branches and paths across repeated goals', async () => {
    const secondRunId = '2026-07-01T12-01-00-repeat-goal';
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-repeat-goal/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-repeat-goal/implementer --label pi-herd repeat-goal implementer --no-focus --json': herdrSuccess('first-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-repeat-goal/implementer')),
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-01-00-repeat-goal/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-01-00-repeat-goal/implementer --label pi-herd repeat-goal implementer --no-focus --json': herdrSuccess('second-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-01-00-repeat-goal/implementer'))
    }));

    const first = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Repeat goal', withWorktrees: true, runner });
    const second = await createRun({ cwd: dir, now: new Date('2026-07-01T12:01:00.000Z'), goal: 'Repeat goal', withWorktrees: true, runner });

    expect(first.state.run_slug).toBe('repeat-goal');
    expect(second.state.run_slug).toBe('repeat-goal');
    expect(second.state.roles.implementer?.branch).toBe(`pi-herd/${secondRunId}/impl`);
    expect(second.state.roles.implementer?.worktree_path).toBe(join(dir, '.worktrees/pi-herd', secondRunId, 'implementer'));
  });

  it('accepts Herdr JSON envelope metadata from nested result data', async () => {
    const checkoutPath = join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-herdr-envelope/implementer');
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-herdr-envelope/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-herdr-envelope/implementer --label pi-herd herdr-envelope implementer --no-focus --json': {
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          result: {
            data: {
              workspace: { id: 'workspace-envelope-123' },
              worktree: { checkout_path: checkoutPath, branch_name: 'pi-herd/2026-07-01T12-00-00-herdr-envelope/impl' }
            }
          }
        }),
        stderr: ''
      }
    }));

    const result = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Herdr envelope', withWorktrees: true, runner });

    expect(result.worktrees[0]).toEqual({
      role: 'implementer',
      branch: 'pi-herd/2026-07-01T12-00-00-herdr-envelope/impl',
      path: checkoutPath,
      provider: 'herdr',
      herdr_workspace_id: 'workspace-envelope-123'
    });
    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.roles.implementer?.herdr_workspace_id).toBe('workspace-envelope-123');
    expect(saved.roles.implementer?.worktree_provider).toBe('herdr');
    expect(runner.calls.some((call) => call.includes('git worktree add'))).toBe(false);
  });

  it('falls back to git worktree when Herdr creation fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-git-fallback/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-git-fallback/implementer --label pi-herd git-fallback implementer --no-focus --json': {
        exitCode: 1,
        stdout: '',
        stderr: 'herdr unavailable\n'
      },
      'git worktree add -b pi-herd/2026-07-01T12-00-00-git-fallback/impl DIR/.worktrees/pi-herd/2026-07-01T12-00-00-git-fallback/implementer main': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    const result = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Git fallback', withWorktrees: true, runner });

    expect(result.worktrees[0]).toMatchObject({ role: 'implementer', provider: 'git', herdr_workspace_id: null });
    expect(result.state.roles.implementer?.worktree_provider).toBe('git');
    expect(runner.calls.some((call) => call.includes('git worktree add -b pi-herd/2026-07-01T12-00-00-git-fallback/impl'))).toBe(true);
    expect(runner.options.find((call) => call.command === 'herdr' && call.args[0] === 'worktree')?.timeoutMs).toBe(120_000);
    expect(runner.options.find((call) => call.command === 'git' && call.args[0] === 'worktree')?.timeoutMs).toBe(120_000);
    expect(runner.options.find((call) => call.command === 'git' && call.args[0] === 'show-ref')?.timeoutMs).toBeUndefined();
  });

  it('optionally creates a planner worktree without materializing reviewer or tester', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-planner-too/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-planner-too/implementer --label pi-herd planner-too implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-planner-too/implementer')),
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-planner-too/planner --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-planner-too/planner --label pi-herd planner-too planner --no-focus --json': herdrSuccess('planner-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-planner-too/planner'))
    }));

    const result = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Planner too', withWorktrees: true, plannerWorktree: true, runner });

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

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'Dirty repo', withWorktrees: true, runner })).rejects.toThrow(/uncommitted changes/);
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

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'Dirty pi herd file', withWorktrees: true, runner })).rejects.toThrow(/uncommitted changes/);
  });

  it('creates a real git fallback worktree in a temporary repository', async () => {
    await nodeCommandRunner.run('git', ['init', '-b', 'main'], { cwd: dir });
    await nodeCommandRunner.run('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
    await nodeCommandRunner.run('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await writeFile(join(dir, 'README.md'), 'hello\n', 'utf8');
    await nodeCommandRunner.run('git', ['add', 'README.md'], { cwd: dir });
    await nodeCommandRunner.run('git', ['commit', '-m', 'init'], { cwd: dir });
    const runner = new HerdrFailingGitRunner();

    const result = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Real git fallback', withWorktrees: true, runner });

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
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-custom-runs/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-custom-runs/implementer --label pi-herd custom-runs implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-custom-runs/implementer'))
    }));

    const result = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Custom runs', withWorktrees: true, runner });

    expect(result.state.canonical_run_dir).toContain(join(dir, 'custom-runs'));
    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
  });

  it('creates worktrees when runs_dir is the repository root', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), configWithRunsDir('.'), 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-root-runs/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-root-runs/implementer --label pi-herd root-runs implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-root-runs/implementer'))
    }));

    const result = await createRun({ cwd: dir, now: RUN_NOW, goal: 'Root runs', withWorktrees: true, runner });

    expect(result.state.roles.implementer?.worktree_status).toBe('materialized');
  });

  it('refuses an existing worktree path before creation', async () => {
    await mkdir(join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-path-exists/implementer'), { recursive: true });
    const runner = new RecordingRunner(baseResponses({}));

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'Path exists', withWorktrees: true, runner })).rejects.toThrow(/Worktree path already exists/);
  });

  it('refuses symlink components in worktree paths before provider creation', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pi-herd-worktree-target-'));
    extraDirs.push(outside);
    await symlink(outside, join(dir, '.worktrees'));
    const runner = new RecordingRunner(baseResponses({}));

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'Symlink worktree root', withWorktrees: true, runner })).rejects.toThrow(/Worktree path must not include symbolic links/);
    expect(runner.calls.some((call) => call.includes('herdr worktree create'))).toBe(false);
    expect(runner.calls.some((call) => call.includes('git worktree add'))).toBe(false);
  });

  it.each([
    {
      name: 'required metadata is omitted',
      goal: 'Incomplete Herdr',
      slug: 'incomplete-herdr',
      response: () => ({
        exitCode: 0,
        stdout: JSON.stringify({ checkout_path: join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-incomplete-herdr/implementer') }),
        stderr: ''
      }),
      expectedError: /Herdr: herdr worktree create returned unusable JSON metadata/
    },
    {
      name: 'the reported checkout path is wrong',
      goal: 'Wrong path',
      slug: 'wrong-path',
      response: () => ({
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123', checkout_path: join(dir, '.worktrees/pi-herd/other/implementer'), branch: 'pi-herd/2026-07-01T12-00-00-wrong-path/impl' }),
        stderr: ''
      }),
      expectedError: /Herdr: herdr worktree create returned unusable JSON metadata/
    },
    {
      name: 'the reported branch is wrong',
      goal: 'Wrong branch',
      slug: 'wrong-branch',
      response: () => ({
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123', checkout_path: join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-wrong-branch/implementer'), branch: 'pi-herd/other/impl' }),
        stderr: ''
      }),
      expectedError: /Herdr: herdr worktree create returned unusable JSON metadata/
    },
    {
      name: 'incomplete JSON is returned',
      goal: 'Bad Herdr',
      slug: 'bad-herdr',
      response: () => ({
        exitCode: 0,
        stdout: JSON.stringify({ workspace_id: 'workspace-123' }),
        stderr: ''
      }),
      expectedError: /Herdr: herdr worktree create returned unusable JSON metadata/
    },
    {
      name: 'Herdr times out',
      goal: 'Herdr timeout',
      slug: 'herdr-timeout',
      response: () => ({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true
      }),
      expectedError: /Herdr: herdr worktree create timed out/
    }
  ])('rejects Herdr worktree creation when $name without attempting git fallback', async ({ goal, slug, response, expectedError }) => {
    const runner = new RecordingRunner(baseResponses({
      [herdrCreateCommand(slug)]: response()
    }));

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal, withWorktrees: true, runner })).rejects.toThrow(expectedError);
    expect(runner.calls.some((call) => call.includes('git worktree add'))).toBe(false);
  });

  it('reports both Herdr and git failures when no provider can create a worktree', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-no-provider/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-no-provider/implementer --label pi-herd no-provider implementer --no-focus --json': {
        exitCode: 1,
        stdout: '',
        stderr: 'herdr failed\n'
      },
      'git worktree add -b pi-herd/2026-07-01T12-00-00-no-provider/impl DIR/.worktrees/pi-herd/2026-07-01T12-00-00-no-provider/implementer main': {
        exitCode: 128,
        stdout: '',
        stderr: 'git failed\n'
      }
    }));

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'No provider', withWorktrees: true, runner })).rejects.toThrow(/Herdr: herdr failed\. Git: git failed/);
  });

  it('persists successful materializations when a later worktree fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-partial-failure/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-partial-failure/implementer --label pi-herd partial-failure implementer --no-focus --json': herdrSuccess('impl-ws', join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-partial-failure/implementer')),
      'git show-ref --verify --quiet refs/heads/pi-herd/2026-07-01T12-00-00-partial-failure/planner': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    let statePath = '';
    try {
      await createRun({ cwd: dir, now: RUN_NOW, goal: 'Partial failure', withWorktrees: true, plannerWorktree: true, runner });
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
      'herdr worktree create --cwd DIR --branch pi-herd/2026-07-01T12-00-00-first-failure/impl --base main --path DIR/.worktrees/pi-herd/2026-07-01T12-00-00-first-failure/implementer --label pi-herd first-failure implementer --no-focus --json': {
        exitCode: 1,
        stdout: '',
        stderr: 'herdr failed\n'
      },
      'git worktree add -b pi-herd/2026-07-01T12-00-00-first-failure/impl DIR/.worktrees/pi-herd/2026-07-01T12-00-00-first-failure/implementer main': {
        exitCode: 128,
        stdout: '',
        stderr: 'git failed\n'
      }
    }));

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'First failure', withWorktrees: true, runner })).rejects.toThrow(/Could not create worktree/);

    const runs = await readdir(join(dir, '.pi-herd/runs'));
    const saved = JSON.parse(await readFile(join(dir, '.pi-herd/runs', runs[0] ?? '', 'state.json'), 'utf8')) as RunState;
    expect(saved.status).toBe('failed');
    expect(saved.roles.implementer?.worktree_status).toBe('pending');
    await expect(resolveActiveRun(dir, undefined, undefined, runner)).rejects.toThrow(/No active runs found/);
  });

  it('refuses existing worktree branches before creation', async () => {
    const runner = new RecordingRunner(baseResponses({
      'git show-ref --verify --quiet refs/heads/pi-herd/2026-07-01T12-00-00-branch-exists/impl': {
        exitCode: 0,
        stdout: '',
        stderr: ''
      }
    }));

    await expect(createRun({ cwd: dir, now: RUN_NOW, goal: 'Branch exists', withWorktrees: true, runner })).rejects.toThrow(/Branch already exists/);
  });
});

function configWithRunsDir(runsDir: string): string {
  return `schema_version: 1\nharness:\n  default: pi\n  profiles:\n    pi:\n      command: pi\npaths:\n  runs_dir: ${JSON.stringify(runsDir)}\n  prompts_dir: .pi-herd/prompts\n`;
}

function herdrCreateCommand(slug: string): string {
  const runId = `${RUN_PREFIX}-${slug}`;
  return `herdr worktree create --cwd DIR --branch pi-herd/${runId}/impl --base main --path DIR/.worktrees/pi-herd/${runId}/implementer --label pi-herd ${slug} implementer --no-focus --json`;
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
    stdout: JSON.stringify({ workspace_id: workspaceId, checkout_path: checkoutPath, branch: branchFromCheckoutPath(checkoutPath) }),
    stderr: ''
  };
}

function branchFromCheckoutPath(checkoutPath: string): string {
  const parts = checkoutPath.split(/[\\/]/);
  const role = parts[parts.length - 1] ?? '';
  const runId = parts[parts.length - 2] ?? '';
  return `pi-herd/${runId}/${role === 'implementer' ? 'impl' : role}`;
}
