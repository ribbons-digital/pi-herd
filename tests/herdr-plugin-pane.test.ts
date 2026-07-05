import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHerdrPluginPane } from '../src/herdr-plugin-pane.js';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import { createRun, writeJsonAtomic } from '../src/run-state.js';

class RecordingRunner implements CommandRunner {
  calls: string[] = [];
  constructor(private readonly responses: Record<string, CommandResult>) {}
  async run(command: string, args: string[]): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    const normalized = key.replace(/\n\n\[pi-herd\] When pass \d+ is complete[\s\S]*$/, '').replaceAll(dir, 'DIR');
    const response = this.responses[normalized] ?? this.responses[key];
    if (response) return response;
    if (command === 'git' && args[0] === 'show-ref') return { exitCode: 1, stdout: '', stderr: '' };
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return { exitCode: 0, stdout: JSON.stringify({ pane_id: args[2], agent_status: 'idle' }), stderr: '' };
    if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') return { exitCode: 0, stdout: '', stderr: '' };
    throw new Error(`Unexpected command: ${key}`);
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

let dir = '';
const NOW = new Date('2026-07-01T12:00:00.000Z');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-pane-'));
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
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

  it('coalesces interval refreshes while a board render is already running', async () => {
    vi.useFakeTimers();
    const stdout = { write: vi.fn() };
    const blockedGitRoot = deferred<CommandResult>();
    let gitRootCalls = 0;
    let resolveQuestion: (value: string) => void = () => {};
    const readline = {
      question: vi.fn(() => new Promise<string>((resolve) => {
        resolveQuestion = resolve;
      })),
      close: vi.fn()
    };
    const runner: CommandRunner = {
      run: vi.fn(async (command: string, args: string[]): Promise<CommandResult> => {
        const key = [command, ...args].join(' ');
        if (key === 'git rev-parse --show-toplevel') {
          gitRootCalls += 1;
          if (gitRootCalls === 3) return blockedGitRoot.promise;
          return { exitCode: 0, stdout: '/repo\n', stderr: '' };
        }
        if (key === 'git symbolic-ref --short HEAD') return { exitCode: 0, stdout: 'main\n', stderr: '' };
        if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') return { exitCode: 0, stdout: JSON.stringify({ pane_id: args[2] }), stderr: '' };
        if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') return { exitCode: 1, stdout: '', stderr: 'timeout\n' };
        throw new Error(`Unexpected command: ${key}`);
      })
    };

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
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(gitRootCalls).toBe(3));

    await vi.advanceTimersByTimeAsync(2_000);

    expect(gitRootCalls).toBe(3);
    expect(stdout.write.mock.calls.filter(([message]) => String(message).includes('# pi-herd run board'))).toHaveLength(1);

    resolveQuestion('q');
    blockedGitRoot.resolve({ exitCode: 0, stdout: '/repo\n', stderr: '' });
    await panePromise;
    await vi.advanceTimersByTimeAsync(2_000);

    expect(gitRootCalls).toBe(4);
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

  it('runs the start wizard with interactive answers', async () => {
    vi.useFakeTimers({ now: NOW });
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn()
        .mockResolvedValueOnce('Launch sessions')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('no'),
      close: vi.fn()
    };
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' }),
      [worktreeCommand('launch-sessions')]: okJson({ workspace_id: 'impl-wt-ws', checkout_path: join(dir, '.worktrees/pi-herd/2026-07-01T12-00-00-launch-sessions/implementer'), branch: 'pi-herd/2026-07-01T12-00-00-launch-sessions/impl' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-launch-sessions-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-launch-sessions-planner --session-id 2026-07-01T12-00-00-launch-sessions-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-launch-sessions.\nGoal: Launch sessions\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-launch-sessions/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': ok(),
      'herdr pane send-keys planner-pane enter': ok(),
      'herdr agent start pi-herd-2026-07-01T12-00-00-launch-sessions-implementer --cwd DIR/.worktrees/pi-herd/2026-07-01T12-00-00-launch-sessions/implementer --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-launch-sessions-implementer --session-id 2026-07-01T12-00-00-launch-sessions-implementer': okJson({ pane_id: 'impl-pane', workspace_id: 'lead-ws', tab_id: 'impl-tab' })
    }));

    const exitCode = await runHerdrPluginPane({
      argv: ['start-wizard'],
      env: {
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: dir }),
        HERDR_ENV: '1',
        HERDR_PANE_ID: 'lead-pane',
        HERDR_WORKSPACE_ID: 'lead-ws',
        HERDR_TAB_ID: 'lead-tab',
        PI_CODING_AGENT: 'true'
      },
      pluginRoot: '/plugin',
      runner,
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(0);
    expect(readline.close).toHaveBeenCalled();
    expect(runner.calls).toContain('herdr pane current --current');
    expect(runner.calls.some((call) => call.startsWith('herdr agent start pi-herd-2026-07-01T12-00-00-launch-sessions-planner'))).toBe(true);
    expect(runner.calls.some((call) => call.startsWith('herdr pane send-text planner-pane'))).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Started run 2026-07-01T12-00-00-launch-sessions'));
  });

  it('rejects an empty start wizard goal', async () => {
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn().mockResolvedValueOnce('   '),
      close: vi.fn()
    };

    const exitCode = await runHerdrPluginPane({
      argv: ['start-wizard'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: dir }) },
      pluginRoot: '/plugin',
      runner: new RecordingRunner({}),
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(1);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Start goal is required.'));
    expect(readline.close).toHaveBeenCalled();
  });

  it('runs the send message pane with interactive answers', async () => {
    await createStartedRun({ plannerPane: 'planner-pane' });
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn()
        .mockResolvedValueOnce('planner')
        .mockResolvedValueOnce('Continue planning')
        .mockResolvedValueOnce(''),
      close: vi.fn()
    };
    const runner = new RecordingRunner(baseResponses({
      'herdr pane send-text planner-pane Continue planning': ok(),
      'herdr pane send-keys planner-pane enter': ok()
    }));

    const exitCode = await runHerdrPluginPane({
      argv: ['send-message'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: dir }) },
      pluginRoot: '/plugin',
      runner,
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(0);
    expect(runner.calls).toContain('herdr pane get planner-pane');
    expect(runner.calls.some((call) => call.startsWith('herdr pane send-text planner-pane Continue planning'))).toBe(true);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Sent message to planner (planner-pane).'));
    expect(readline.close).toHaveBeenCalled();
  });

  it('rejects an empty send message', async () => {
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn()
        .mockResolvedValueOnce('planner')
        .mockResolvedValueOnce('   '),
      close: vi.fn()
    };

    const exitCode = await runHerdrPluginPane({
      argv: ['send-message'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: dir }) },
      pluginRoot: '/plugin',
      runner: new RecordingRunner({}),
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(1);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('Send message is required.'));
    expect(readline.close).toHaveBeenCalled();
  });

  it('rejects an invalid send role', async () => {
    const stdout = { write: vi.fn() };
    const readline = {
      question: vi.fn().mockResolvedValueOnce('lead'),
      close: vi.fn()
    };

    const exitCode = await runHerdrPluginPane({
      argv: ['send-message'],
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: dir }) },
      pluginRoot: '/plugin',
      runner: new RecordingRunner({}),
      stdout,
      createReadline: () => readline as never
    });

    expect(exitCode).toBe(1);
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining("Unknown role 'lead'"));
    expect(readline.close).toHaveBeenCalled();
  });
});

async function createStartedRun(options: { plannerPane: string }) {
  const result = await createRun({ cwd: dir, goal: 'Send review', now: NOW, runner: new RecordingRunner(baseResponses({})) });
  result.state.lead_binding.herdr_workspace_id = 'lead-ws';
  result.state.lead_binding.herdr_pane_id = 'lead-pane';
  result.state.roles.planner!.status = 'staged';
  result.state.roles.planner!.herdr_workspace_id = 'lead-ws';
  result.state.roles.planner!.herdr_pane_id = options.plannerPane;
  await writeJsonAtomic(result.statePath, result.state);
  return result;
}

function baseResponses(overrides: Record<string, CommandResult>): Record<string, CommandResult> {
  return {
    'git rev-parse --show-toplevel': { exitCode: 0, stdout: `${dir}\n`, stderr: '' },
    'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' },
    'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': ok(),
    ...normalize(overrides)
  };
}

function normalize(responses: Record<string, CommandResult>): Record<string, CommandResult> {
  const normalized: Record<string, CommandResult> = {};
  for (const [key, value] of Object.entries(responses)) normalized[key.replaceAll(dir, 'DIR')] = value;
  return normalized;
}

function worktreeCommand(slug: string): string {
  const runId = `2026-07-01T12-00-00-${slug}`;
  return `herdr worktree create --cwd DIR --branch pi-herd/${runId}/impl --base main --path DIR/.worktrees/pi-herd/${runId}/implementer --label pi-herd ${slug} implementer --no-focus --json`;
}

function ok(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '' };
}

function okJson(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
}
