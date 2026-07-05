import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHerdrPluginPane } from '../src/herdr-plugin-pane.js';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';

class RecordingRunner implements CommandRunner {
  calls: string[] = [];
  constructor(private readonly responses: Record<string, CommandResult>) {}
  async run(command: string, args: string[]): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    const response = this.responses[key];
    if (response) return response;
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return { exitCode: 0, stdout: JSON.stringify({ pane_id: args[2] }), stderr: '' };
    if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') return { exitCode: 1, stdout: '', stderr: 'timeout\n' };
    throw new Error(`Unexpected command: ${key}`);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Herdr plugin pane entrypoint', () => {
  it('renders the board from Herdr plugin context and exits in non-hold mode', async () => {
    const stdout = { write: vi.fn() };
    const runner = new RecordingRunner({
      'git rev-parse --show-toplevel': { exitCode: 0, stdout: '/repo\n', stderr: '' },
      'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' }
    });

    const exitCode = await runHerdrPluginPane({
      argv: ['run-board'],
      env: {
        HERDR_PLUGIN_ROOT: '/plugin',
        HERDR_PLUGIN_ENTRYPOINT_ID: 'run-board',
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/repo' })
      },
      pluginRoot: '/plugin',
      runner,
      stdout,
      holdOpen: false
    });

    expect(exitCode).toBe(0);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('# pi-herd run board'));
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('No active pi-herd run'));
  });

  it('rejects unknown pane entrypoints', async () => {
    const stdout = { write: vi.fn() };

    const exitCode = await runHerdrPluginPane({ argv: ['missing'], stdout, holdOpen: false });

    expect(exitCode).toBe(1);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Unknown pi-herd plugin pane'));
  });

  it('keeps the pane process open after render errors in hold-open mode', async () => {
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn().mockResolvedValue('q'),
      close: vi.fn()
    };

    const exitCode = await runHerdrPluginPane({
      argv: ['run-board'],
      env: {},
      pluginRoot: '/plugin',
      runner: new RecordingRunner({}),
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(0);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Could not determine a target project directory'));
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Auto-refreshes every 10s'));
    expect(readline.question).toHaveBeenCalled();
  });

  it('refreshes the board once before quitting from the hold-open prompt', async () => {
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce('q'),
      close: vi.fn()
    };
    const runner = new RecordingRunner({
      'git rev-parse --show-toplevel': { exitCode: 0, stdout: '/repo\n', stderr: '' },
      'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' }
    });

    const exitCode = await runHerdrPluginPane({
      argv: ['run-board'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/repo' }) },
      pluginRoot: '/plugin',
      runner,
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(0);
    expect(readline.question).toHaveBeenCalledTimes(2);
    expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(2);
  });

  it('auto-refreshes the board while hold-open mode waits for input', async () => {
    vi.useFakeTimers();
    const stdout = { write: vi.fn() };
    let resolveQuestion: (value: string) => void = () => {};
    const readline = {
      question: vi.fn(() => new Promise<string>((resolve) => {
        resolveQuestion = resolve;
      })),
      close: vi.fn()
    };
    const runner = new RecordingRunner({
      'git rev-parse --show-toplevel': { exitCode: 0, stdout: '/repo\n', stderr: '' },
      'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' }
    });

    const panePromise = runHerdrPluginPane({
      argv: ['run-board'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/repo' }) },
      pluginRoot: '/plugin',
      runner,
      stdout,
      createReadline: () => readline as never,
      autoRefreshIntervalMs: 500
    });

    await vi.waitFor(() => expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(1));
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Auto-refreshes every 500ms'));

    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(2));

    resolveQuestion('q');
    await panePromise;
  });

  it('stops auto-refreshing after q then Enter quits hold-open mode', async () => {
    vi.useFakeTimers();
    const stdout = { write: vi.fn() };
    let resolveQuestion: (value: string) => void = () => {};
    const readline = {
      question: vi.fn(() => new Promise<string>((resolve) => {
        resolveQuestion = resolve;
      })),
      close: vi.fn()
    };
    const runner = new RecordingRunner({
      'git rev-parse --show-toplevel': { exitCode: 0, stdout: '/repo\n', stderr: '' },
      'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' }
    });

    const panePromise = runHerdrPluginPane({
      argv: ['run-board'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/repo' }) },
      pluginRoot: '/plugin',
      runner,
      stdout,
      createReadline: () => readline as never,
      autoRefreshIntervalMs: 1_000
    });

    await vi.waitFor(() => expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(1_000);

    resolveQuestion('q');
    await panePromise;
    await vi.advanceTimersByTimeAsync(100);

    expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(2);
    expect(readline.close).toHaveBeenCalled();
  });

  it('does not start auto-refresh in non-hold mode', async () => {
    vi.useFakeTimers();
    const stdout = { write: vi.fn() };
    const runner = new RecordingRunner({
      'git rev-parse --show-toplevel': { exitCode: 0, stdout: '/repo\n', stderr: '' },
      'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' }
    });

    const exitCode = await runHerdrPluginPane({
      argv: ['run-board'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/repo' }) },
      pluginRoot: '/plugin',
      runner,
      stdout,
      holdOpen: false,
      autoRefreshIntervalMs: 25
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(exitCode).toBe(0);
    expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(1);
  });

  it('rejects unsupported pane arguments', async () => {
    const stdout = { write: vi.fn() };
    const runner = new RecordingRunner({});

    const exitCode = await runHerdrPluginPane({
      argv: ['run-board', '--json'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/repo' }) },
      pluginRoot: '/plugin',
      runner,
      stdout,
      holdOpen: false
    });

    expect(exitCode).toBe(1);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Unsupported plugin pane argument: --json'));
  });
});
