import { realpathSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import piHerdExtension, {
  buildHerdCliEnv,
  buildHerdCommand,
  buildHerdStartAliasCommand,
  boundOutput,
  createHerdCommandHandler,
  createHerdStartAliasHandler,
  nodeCommandRunner,
  presentOutput,
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

  it('maps init, doctor, and start to top-level CLI commands', () => {
    expect(buildHerdCommand('init')).toEqual({ cliArgs: ['init'], displayName: '/herd init', timeoutMs: 30_000, warnOnExitOneWithStdout: false });
    expect(buildHerdCommand('doctor')).toEqual({ cliArgs: ['doctor'], displayName: '/herd doctor', timeoutMs: 30_000, warnOnExitOneWithStdout: true });
    expect(buildHerdCommand('start implement X')).toMatchObject({ cliArgs: ['start', 'implement X'], displayName: '/herd start', timeoutMs: 300_000 });
  });

  it('maps read-oriented lead commands to existing pi-herd lead commands', () => {
    expect(buildHerdCommand('status')).toEqual({ cliArgs: ['lead', 'status'], displayName: '/herd status', timeoutMs: 30_000 });
    expect(buildHerdCommand('brief --run run-1')).toEqual({ cliArgs: ['lead', 'brief', '--run', 'run-1'], displayName: '/herd brief', timeoutMs: 30_000 });
    expect(buildHerdCommand('collect --run run-1')).toEqual({ cliArgs: ['lead', 'collect', '--run', 'run-1'], displayName: '/herd collect', timeoutMs: 30_000 });
  });

  it('rejects unknown args for non-send subcommands', () => {
    expect(() => buildHerdCommand('status --json')).toThrow('Unknown argument');
    expect(() => buildHerdCommand('doctor --json')).toThrow('Unknown argument');
  });

  it('rejects start without a goal or with leading flag-like usage', () => {
    expect(() => buildHerdCommand('start')).toThrow('Usage: /herd start <goal>');
    expect(() => buildHerdCommand('start --role planner')).toThrow('For advanced flags');
  });

  it('maps the /herd-start alias to the existing top-level start path', () => {
    expect(buildHerdStartAliasCommand('implement X')).toMatchObject({ cliArgs: ['start', 'implement X'], displayName: '/herd-start', timeoutMs: 300_000 });
    expect(buildHerdStartAliasCommand('"implement X"')).toMatchObject({ cliArgs: ['start', 'implement X'], displayName: '/herd-start' });
  });

  it('rejects /herd-start without a goal or with leading flag-like usage', () => {
    expect(() => buildHerdStartAliasCommand('')).toThrow('Usage: /herd-start <goal>');
    expect(() => buildHerdStartAliasCommand('--role planner')).toThrow('For advanced flags');
  });

  it('rejects unrecognized subcommands', () => {
    expect(() => buildHerdCommand('foobar')).toThrow('Unknown /herd command: foobar');
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

  it('strips one matching outer quote pair from send message text', () => {
    expect(buildHerdCommand('send reviewer "please review"')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please review'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
    expect(buildHerdCommand("send reviewer 'please review' --run run-1")).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please review', '--run', 'run-1'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('preserves backslashes in quoted send message text', () => {
    expect(buildHerdCommand(String.raw`send reviewer "C:\tmp\logs and regex \d+\s"`)).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', String.raw`C:\tmp\logs and regex \d+\s`],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
    expect(buildHerdCommand(String.raw`send reviewer "please \"review\" C:\tmp"`)).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', String.raw`please "review" C:\tmp`],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('keeps run-looking text inside matching outer message quotes', () => {
    expect(buildHerdCommand('send reviewer "please mention --run run-1"')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please mention --run run-1'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
    expect(buildHerdCommand("send reviewer 'please mention --run run-1' --run run-2")).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please mention --run run-1', '--run', 'run-2'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('preserves apostrophes and unmatched quote characters in send message text', () => {
    expect(buildHerdCommand('send reviewer don\'t forget tests')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'don\'t forget tests'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
    expect(buildHerdCommand('send reviewer don\'t forget "tests --run run-1')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'don\'t forget "tests', '--run', 'run-1'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('parses quoted trailing run selectors without parsing send message text', () => {
    expect(buildHerdCommand('send reviewer don\'t forget tests --run "run one"')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'don\'t forget tests', '--run', 'run one'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
  });

  it('keeps non-trailing run-looking text in send messages', () => {
    expect(buildHerdCommand('send reviewer please mention --run run-1 in docs today')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please mention --run run-1 in docs today'],
      displayName: '/herd send',
      timeoutMs: 300_000
    });
    expect(buildHerdCommand('send reviewer please mention --run "unfinished')).toEqual({
      cliArgs: ['lead', 'send', 'reviewer', 'please mention --run "unfinished'],
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

  it('prefixes PATH with the absolute HERDR_BIN_PATH directory', () => {
    expect(buildHerdCliEnv({ HERDR_BIN_PATH: '/opt/herdr/bin/herdr', PATH: '/usr/bin', KEEP: 'yes' })).toEqual({
      HERDR_BIN_PATH: '/opt/herdr/bin/herdr',
      PATH: `/opt/herdr/bin${delimiter}/usr/bin`,
      KEEP: 'yes'
    });
  });

  it('ignores relative HERDR_BIN_PATH values', () => {
    expect(buildHerdCliEnv({ HERDR_BIN_PATH: 'tools/herdr', PATH: '/usr/bin' })).toEqual({
      HERDR_BIN_PATH: 'tools/herdr',
      PATH: '/usr/bin'
    });
  });
});

describe('pi extension registration', () => {
  it('registers /herd and /herd-start commands', () => {
    const registerCommand = vi.fn();

    piHerdExtension({ registerCommand });

    expect(registerCommand).toHaveBeenCalledWith('herd', expect.objectContaining({ description: 'Lead-session pi-herd shortcuts' }));
    expect(registerCommand).toHaveBeenCalledWith('herd-start', expect.objectContaining({ description: expect.stringContaining('Start a pi-herd run') }));
  });
});

describe('pi extension command handler', () => {
  it('invokes the resolved CLI from ctx.cwd and notifies bounded stdout', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'ok\n', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('status --run run-1', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['lead', 'status', '--run', 'run-1'], { cwd: '/tmp/project', timeoutMs: 30_000, env: { PI_HERD_CLI: '/opt/bin/pi-herd' } });
    expect(ctx.ui?.notify).toHaveBeenCalledWith('ok', 'info');
  });

  it('passes the HERDR_BIN_PATH directory on PATH to the CLI', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'ok\n', stderr: '' });
    const ctx = fakeContext();
    const env = { PI_HERD_CLI: '/opt/bin/pi-herd', HERDR_BIN_PATH: '/opt/herdr/bin/herdr', PATH: '/usr/bin' };
    const handler = createHerdCommandHandler({ runner, env, moduleUrl: 'file:///missing.js' });

    await handler('status', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['lead', 'status'], {
      cwd: '/tmp/project',
      timeoutMs: 30_000,
      env: { ...env, PATH: `/opt/herdr/bin${delimiter}/usr/bin` }
    });
  });

  it('uses the longer activation timeout for send commands', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'sent\n', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('send reviewer please review', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['lead', 'send', 'reviewer', 'please review'], { cwd: '/tmp/project', timeoutMs: 300_000, env: { PI_HERD_CLI: '/opt/bin/pi-herd' } });
  });

  it('prints usage without invoking the CLI for help', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: '', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('help', ctx);

    expect(runner.run).not.toHaveBeenCalled();
    expect(ctx.ui?.notify).toHaveBeenCalledWith(expect.stringContaining('/herd status'), 'info');
  });

  it('uses the longer activation timeout for start commands and preserves Herdr/Pi env', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'started\n', stderr: '' });
    const ctx = fakeContext();
    const env = { PI_HERD_CLI: '/opt/bin/pi-herd', HERDR_ENV: '1', HERDR_PANE_ID: 'pane-1', PI_CODING_AGENT: 'true', HERDR_BIN_PATH: '/opt/herdr/bin/herdr', PATH: '/usr/bin' };
    const handler = createHerdCommandHandler({ runner, env, moduleUrl: 'file:///missing.js' });

    await handler('start implement X', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['start', 'implement X'], {
      cwd: '/tmp/project',
      timeoutMs: 300_000,
      env: { ...env, PATH: `/opt/herdr/bin${delimiter}/usr/bin` }
    });
  });

  it('runs /herd-start through the same CLI-backed start path', async () => {
    const runner = fakeRunner({ exitCode: 0, stdout: 'started\n', stderr: '' });
    const ctx = fakeContext();
    const handler = createHerdStartAliasHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('implement X', ctx);

    expect(runner.run).toHaveBeenCalledWith('/opt/bin/pi-herd', ['start', 'implement X'], { cwd: '/tmp/project', timeoutMs: 300_000, env: { PI_HERD_CLI: '/opt/bin/pi-herd' } });
    expect(ctx.ui?.notify).toHaveBeenCalledWith('started', 'info');
  });

  it('shows doctor checks-failed reports and stderr as warnings without throwing', async () => {
    const runner = fakeRunner({ exitCode: 1, stdout: 'doctor report\n', stderr: 'doctor warning\n' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await handler('doctor', ctx);

    expect(ctx.ui?.notify).toHaveBeenCalledWith('doctor warning\ndoctor report', 'warning');
  });

  it('treats doctor stderr-only failures as hard failures', async () => {
    const runner = fakeRunner({ exitCode: 1, stdout: '', stderr: 'crashed' });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await expect(handler('doctor', ctx)).rejects.toThrow('/herd doctor failed with exit code 1');
    expect(ctx.ui?.notify).toHaveBeenCalledWith(expect.stringContaining('crashed'), 'error');
  });

  it('reports send timeout using the send timeout budget', async () => {
    const runner = fakeRunner({ exitCode: null, stdout: '', stderr: '', timedOut: true });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await expect(handler('send reviewer please review', ctx)).rejects.toThrow('/herd send timed out after 300000ms.');
    expect(ctx.ui?.notify).toHaveBeenCalledWith('/herd send timed out after 300000ms.', 'error');
  });

  it('reports start timeout with partial-run recovery guidance', async () => {
    const runner = fakeRunner({ exitCode: null, stdout: '', stderr: '', timedOut: true });
    const ctx = fakeContext();
    const handler = createHerdCommandHandler({ runner, env: { PI_HERD_CLI: '/opt/bin/pi-herd' }, moduleUrl: 'file:///missing.js' });

    await expect(handler('start implement X', ctx)).rejects.toThrow('The run may have partially started');
    expect(ctx.ui?.notify).toHaveBeenCalledWith(expect.stringContaining('pi-herd run list'), 'error');
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

  it('writes raw output only in print mode without UI', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    presentOutput({ cwd: '/tmp/project', hasUI: false, mode: 'json' }, 'json-output', 'info');
    presentOutput({ cwd: '/tmp/project', hasUI: false, mode: 'print' }, 'print-output', 'info');
    presentOutput({ cwd: '/tmp/project', hasUI: false, mode: 'print' }, 'print-error', 'error');

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith('print-output\n');
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr).toHaveBeenCalledWith('print-error\n');
  });

  it('notifies when UI is available in RPC-style contexts', () => {
    const notify = vi.fn();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    presentOutput({ cwd: '/tmp/project', hasUI: true, mode: 'rpc', ui: { notify } }, 'rpc-output', 'info');

    expect(notify).toHaveBeenCalledWith('rpc-output', 'info');
    expect(stdout).not.toHaveBeenCalled();
  });

  it('caps child stdout and stderr captured in memory', async () => {
    const result = await nodeCommandRunner.run(process.execPath, [
      '-e',
      'process.stdout.write("x".repeat(13000)); process.stderr.write("y".repeat(13000));'
    ], { timeoutMs: 5_000 });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toHaveLength(12_000);
    expect(result.stderr).toHaveLength(12_000);
  });
});

function fakeRunner(result: { exitCode: number | null; stdout: string; stderr: string; timedOut?: boolean; error?: NodeJS.ErrnoException }): CommandRunner & { run: ReturnType<typeof vi.fn> } {
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
