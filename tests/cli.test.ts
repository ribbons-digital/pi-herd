import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const cleanupMocks = vi.hoisted(() => ({
  cleanupRun: vi.fn(),
  mergePlanRun: vi.fn()
}));

vi.mock('../src/cleanup.js', () => cleanupMocks);

import { cleanupRun, mergePlanRun, type LifecycleCommandResult } from '../src/cleanup.js';
import { main, parseSendArgs } from '../src/cli.js';

const execFileAsync = promisify(execFile);

describe('cli main', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('returns an exit code instead of throwing for parse errors', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(main(['doctor', '--unknown'])).resolves.toBe(1);
  });

  it('accepts a leading argument separator from package script invocations', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(main(['--', '--help'])).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd run create');
    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd refresh <reviewer|tester>');
    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd diff');
    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd merge-plan');
    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd cleanup');
  });

  it('routes cleanup through the top-level CLI parser', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(cleanupRun).mockResolvedValue(commandResult('cleanup ok\n'));

    await expect(main(['cleanup', '--run', 'run-1', '--complete', '--close-panes', '--remove-worktrees', '--force', '--json'])).resolves.toBe(0);

    expect(cleanupRun).toHaveBeenCalledWith(expect.objectContaining({
      run: 'run-1',
      complete: true,
      abandon: false,
      closePanes: true,
      removeWorktrees: true,
      force: true,
      json: true
    }));
    expect(stdout.mock.calls.flat().join('')).toContain('cleanup ok');
  });

  it('routes cleanup abandon through the top-level CLI parser', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(cleanupRun).mockResolvedValue(commandResult('cleanup abandoned\n'));

    await expect(main(['cleanup', '--run', 'run-1', '--abandon'])).resolves.toBe(0);

    expect(cleanupRun).toHaveBeenCalledWith(expect.objectContaining({
      run: 'run-1',
      complete: false,
      abandon: true
    }));
    expect(stdout.mock.calls.flat().join('')).toContain('cleanup abandoned');
  });

  it('routes merge-plan through the top-level CLI parser', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(mergePlanRun).mockResolvedValue(commandResult('merge plan ok\n'));

    await expect(main(['merge-plan', '--run', 'run-1', '--json'])).resolves.toBe(0);

    expect(mergePlanRun).toHaveBeenCalledWith(expect.objectContaining({
      run: 'run-1',
      json: true
    }));
    expect(stdout.mock.calls.flat().join('')).toContain('merge plan ok');
  });

  it('creates a run from the CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-herd-cli-'));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
      await expect(main(['run', 'create', 'Add run state'], dir)).resolves.toBe(0);
      expect(stdout.mock.calls.join('\n')).toContain('Created run');
      const runsDir = join(dir, '.pi-herd/runs');
      const output = stdout.mock.calls.flat().join('');
      const runId = output.match(/Created run (\S+)/)?.[1];
      expect(runId).toBeTruthy();
      await expect(readFile(join(runsDir, runId ?? '', 'state.json'), 'utf8')).resolves.toContain('add-run-state');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('lists runs from the CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-herd-cli-list-'));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await execFileAsync('git', ['init', '-b', 'main'], { cwd: dir });
      await expect(main(['run', 'create', 'List me'], dir)).resolves.toBe(0);
      stdout.mockClear();
      await expect(main(['run', 'list'], dir)).resolves.toBe(0);
      expect(stdout.mock.calls.flat().join('')).toContain('list-me');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('parses send run and config options after the message', () => {
    const parsed = parseSendArgs(['planner', 'hello', '--run', 'latest', '--config', 'herd.yaml'], 'usage');

    expect(parsed).toMatchObject({ role: 'planner', message: 'hello', run: 'latest', config: 'herd.yaml' });
  });

  it('treats tokens after the send separator as literal message text', () => {
    const parsed = parseSendArgs(['planner', '--run', 'latest', '--', '--', '--run', 'literal', '--config', 'text'], 'usage');

    expect(parsed).toMatchObject({ role: 'planner', message: '-- --run literal --config text', run: 'latest' });
    expect(parsed.config).toBeUndefined();
  });
});

function commandResult(text: string): LifecycleCommandResult {
  return {
    state: {} as LifecycleCommandResult['state'],
    snapshot: {} as LifecycleCommandResult['snapshot'],
    text,
    exitCode: 0
  };
}
