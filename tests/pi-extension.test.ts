import { realpathSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHerdCommand,
  boundOutput,
  createHerdCommandHandler,
  resolveHerdCli,
  tokenizeWithSpans,
  type CommandRunner,
  type PiCommandContext
} from '../src/pi-extension.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pi extension /herd argument mapping', () => {
  it('shows help for empty args and help aliases', () => {
    expect(buildHerdCommand('')).toBeNull();
    expect(buildHerdCommand('help')).toBeNull();
    expect(buildHerdCommand('--help')).toBeNull();
  });

  it('maps read-oriented lead commands to existing pi-herd lead commands', () => {
    expect(buildHerdCommand('status')).toEqual({ cliArgs: ['lead', 'status'], displayName: '/herd status', timeoutMs: 30_000 });
    expect(buildHerdCommand('brief --run run-1')).toEqual({ cliArgs: ['lead', 'brief', '--run', 'run-1'], displayName: '/herd brief', timeoutMs: 30_000 });
    expect(buildHerdCommand('collect --run run-1')).toEqual({ cliArgs: ['lead', 'collect', '--run', 'run-1'], displayName: '/herd collect', timeoutMs: 30_000 });
  });

  it('rejects unknown args for non-send subcommands', () => {
    expect(() => buildHerdCommand('status --json')).toThrow('Unknown argument');
  });

  it('maps send while preserving message text as one CLI argument', () => {
    expect(buildHerdCommand('send reviewer please review --run run-1')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please review', '--run', 'run-1'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('allows dash-prefixed send message text', () => {
    expect(buildHerdCommand('send tester --focus flaky tests')).toEqual({
      cliArgs: ['lead', 'send', 'tester', '--focus flaky tests'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('rejects send commands that only provide a trailing run selector without message text', () => {
    expect(() => buildHerdCommand('send reviewer --run run-1')).toThrow('Message must be a non-empty string');
  });

  it('tokenizes quoted run selectors for option parsing', () => {
    expect(tokenizeWithSpans('brief --run "run one"').map((token) => token.value)).toEqual(['brief', '--run', 'run one']);
  });
});

describe('pi extension CLI resolution', () => {
  it('uses PI_HERD_CLI as an executable override', () => {
    expect(resolveHerdCli({ env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' })).toEqual({
      command: '/opt/bin/pi-herd',
      argsPrefix: [],
      source: 'env'
    });
  });

  it('uses node for a PI_HERD_CLI JavaScript file override', () => {
    expect(resolveHerdCli({ env: { PI_HERD_CLI: '/opt/pi-herd/dist/cli.js' }, moduleUrl: 'file:///missing.js' })).toEqual({
      command: process.execPath,
      argsPrefix: ['/opt/pi-herd/dist/cli.js'],
      source: 'env'
    });
  });

  it('resolves sibling dist/cli.js from the real extension path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-herd-extension-'));
    const extensionPath = join(dir, 'pi-extension.js');
    const cliPath = join(dir, 'cli.js');
    await writeFile(extensionPath, 'export default function() {}\n');
    await writeFile(cliPath, '#!/usr/bin/env node\n');

    expect(resolveHerdCli({ env: {}, moduleUrl: pathToFileURL(extensionPath).href })).toEqual({
      command: process.execPath,
      argsPrefix: [join(dirname(realpathSync(extensionPath)), 'cli.js')],
      source: 'sibling-dist'
    });
  });

  it('falls back to pi-herd on PATH when no override or sibling CLI exists', () => {
    expect(resolveHerdCli({ env: {}, moduleUrl: 'file:///missing.js' })).toEqual({
      command: 'pi-herd',
      argsPrefix: [],
      source: 'path'
    });
  });
});

describe('pi extension command handler', () => {
  it('invokes the resolved CLI from ctx.cwd and notifies bounded stdout', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'ok\n', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('status --run run-1', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['lead', 'status', '--run', 'run-1'], { cwd: '/tmp/project', timeoutMs: 30_000 });
    expect(ctx.ui?.notify).toHaveBeenCalledWith('ok', 'info');
  });

  it('uses the longer activation timeout for send commands', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'sent\n', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('send reviewer please review', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['lead', 'send', 'reviewer', 'please review'], { cwd: '/tmp/project', timeoutMs: 300_000 });
  });

  it('prints usage without invoking the CLI for help', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: '', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('help', ctx);

    expect(runner.run).not.toHaveBeenCalled();
    expect(ctx.ui?.notify).toHaveBeenCalledWith(expect.stringContaining('/herd status'), 'info');
  });

  it('reports send timeout using the send timeout budget', async () => {
    const runner = fakeRunner({ exitCode: null, stdout: '', stderr: '', timedOut: true });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await expect(handler('send reviewer please review', ctx)).rejects.toThrow('/herd send timed out after 300000ms.');
    expect(ctx.ui?.notify).toHaveBeenCalledWith('/herd send timed out after 300000ms.', 'error');
  });

  it('notifies and throws on CLI failure', async () => {
    const runner = fakeRunner({ exitCode: 2, stdout: '', stderr: 'bad run' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await expect(handler('status', ctx)).rejects.toThrow('/herd status failed with exit code 2');
    expect(ctx.ui?.notify).toHaveBeenCalledWith(expect.stringContaining('bad run'), 'error');
  });
});

describe('pi extension output bounding', () => {
  it('truncates long output', () => {
    expect(boundOutput('abcdef', 3)).toBe('abc\n\n[Output truncated to 3 characters.]');
  });
});

function fakeRunner(result: { exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean }): CommandRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn().mockResolvedValue(result)
  };
}

function fakeContext(): PiCommandContext {
  return {
    cwd: '/tmp/project',
    hasUI: true,
    ui: {
      notify: vi.fn()
    }
  };
}
