import { readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseToml } from 'smol-toml';
import {
  applyHerdrBinPath,
  buildPluginCliArgs,
  cwdFromPluginContext,
  resolvePluginTargetCwd,
  runHerdrPluginAction,
  type PluginRuntimeEnv
} from '../src/herdr-plugin-action.js';
import type { CommandRunner } from '../src/command-runner.js';

const repoRoot = process.cwd();

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  min_herdr_version: string;
  platforms: string[];
  build?: Array<{ command: string[] }>;
  actions: Array<{ id: string; title: string; contexts: string[]; command: string[] }>;
  panes: Array<{ id: string; title: string; command: string[] }>;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Herdr plugin manifest', () => {
  it('declares the expected metadata, supported platforms, actions, and panes', async () => {
    const manifestText = await readFile(join(repoRoot, 'herdr-plugin.toml'), 'utf8');
    const manifest = parseToml(manifestText) as unknown as PluginManifest;

    expect(manifest.id).toBe('ribbons-digital.pi-herd');
    expect(manifest.name).toBe('pi-herd');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.min_herdr_version).toBe('0.7.1');
    expect(manifest.platforms).toEqual(['linux', 'macos']);
    expect(manifest.build).toBeUndefined();

    expect(manifest.actions.map((action) => action.id)).toEqual(['doctor', 'start', 'status', 'collect', 'cleanup']);
    for (const action of manifest.actions) {
      expect(action.contexts).toEqual(['workspace', 'tab', 'pane']);
      expect(action.command.slice(0, 2)).toEqual(['node', 'dist/herdr-plugin-action.js']);
    }
    expect(Object.fromEntries(manifest.actions.map((action) => [action.id, action.command[2]]))).toEqual({
      doctor: 'doctor',
      start: 'start-help',
      status: 'status',
      collect: 'collect',
      cleanup: 'cleanup'
    });
    expect(manifest.actions.find((action) => action.id === 'collect')?.title).toBe('pi-herd collect read-only');
    expect(manifest.panes).toEqual([
      { id: 'run-board', title: 'pi-herd run board', command: ['node', 'dist/herdr-plugin-pane.js', 'run-board'] },
      { id: 'start-wizard', title: 'pi-herd start wizard', command: ['node', 'dist/herdr-plugin-pane.js', 'start-wizard'] },
      { id: 'send-message', title: 'pi-herd send message', command: ['node', 'dist/herdr-plugin-pane.js', 'send-message'] }
    ]);
  });
});

describe('Herdr plugin action wrapper', () => {
  it('resolves target cwd from focused pane context before workspace context', () => {
    const context = JSON.stringify({
      focused_pane_cwd: '/tmp/project-focused',
      workspace_cwd: '/tmp/project-workspace'
    });

    expect(cwdFromPluginContext(context, '/tmp/plugin-root')).toBe('/tmp/project-focused');
  });

  it('resolves relative context cwd values against plugin root', () => {
    const context = JSON.stringify({ focused_pane_cwd: 'relative-project' });

    expect(cwdFromPluginContext(context, '/tmp/plugin-root')).toBe('/tmp/plugin-root/relative-project');
  });

  it('resolves target cwd from Herdr pane metadata when env provides a pane id', async () => {
    const runner = fakeRunner(JSON.stringify({
      result: {
        pane: {
          foreground_cwd: '/tmp/project-from-pane',
          cwd: '/tmp/project-fallback'
        }
      }
    }));

    await expect(resolvePluginTargetCwd({
      env: { HERDR_PANE_ID: 'w1:p2', HERDR_BIN_PATH: '/opt/herdr/bin/herdr' },
      pluginRoot: '/tmp/plugin-root',
      runner
    })).resolves.toBe('/tmp/project-from-pane');

    expect(runner.run).toHaveBeenCalledWith('/opt/herdr/bin/herdr', ['pane', 'current', '--pane', 'w1:p2'], { cwd: '/tmp/plugin-root', timeoutMs: 5_000 });
  });

  it('resolves target cwd from Herdr pane metadata when context provides a pane id', async () => {
    const runner = fakeRunner(JSON.stringify({ result: { pane: { cwd: '/tmp/project-from-context-pane' } } }));

    await expect(resolvePluginTargetCwd({
      env: { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: 'w1:p3' }) },
      pluginRoot: '/tmp/plugin-root',
      runner
    })).resolves.toBe('/tmp/project-from-context-pane');

    expect(runner.run).toHaveBeenCalledWith('herdr', ['pane', 'current', '--pane', 'w1:p3'], { cwd: '/tmp/plugin-root', timeoutMs: 5_000 });
  });

  it('fails closed without querying current pane when no specific pane id is available', async () => {
    const runner = fakeRunner('', 1);

    await expect(resolvePluginTargetCwd({
      env: { HERDR_PLUGIN_CONTEXT_JSON: '{bad json' },
      pluginRoot: '/tmp/plugin-root',
      runner
    })).rejects.toThrow('Could not determine a target project directory');

    expect(runner.run).not.toHaveBeenCalled();
  });

  it('fails closed when explicit Herdr pane lookup fails', async () => {
    const runner = fakeRunner('not json');

    await expect(resolvePluginTargetCwd({
      env: { HERDR_PANE_ID: 'w1:p2' },
      pluginRoot: '/tmp/plugin-root',
      runner
    })).rejects.toThrow('Could not determine a target project directory');

    expect(runner.run).toHaveBeenCalledWith('herdr', ['pane', 'current', '--pane', 'w1:p2'], { cwd: '/tmp/plugin-root', timeoutMs: 5_000 });
  });

  it('builds safe CLI args for doctor, status, collect, and report-only cleanup', () => {
    expect(buildPluginCliArgs('doctor', ['--json', '--config', 'herd.yaml'])).toEqual(['doctor', '--json', '--config', 'herd.yaml']);
    expect(buildPluginCliArgs('status', ['--run', 'run-1'])).toEqual(['status', '--run', 'run-1']);
    expect(buildPluginCliArgs('collect', ['--config', 'herd.yaml'])).toEqual(['lead', 'collect', '--config', 'herd.yaml']);
    expect(buildPluginCliArgs('cleanup', ['--run', 'run-1'])).toEqual(['cleanup', '--run', 'run-1']);
  });

  it('rejects destructive cleanup flags', () => {
    expect(() => buildPluginCliArgs('cleanup', ['--complete'])).toThrow('report-only');
    expect(() => buildPluginCliArgs('cleanup', ['--remove-worktrees'])).toThrow('report-only');
    expect(() => buildPluginCliArgs('cleanup', ['--force'])).toThrow('report-only');
  });

  it('requires explicit start goal text and rejects start flags for the direct wrapper path', () => {
    expect(() => buildPluginCliArgs('start', [])).toThrow('Usage: pi-herd plugin start <goal>');
    expect(() => buildPluginCliArgs('start', ['--base-ref', 'main'])).toThrow('only accepts goal text');
    expect(buildPluginCliArgs('start', ['ship', 'plugin'])).toEqual(['start', 'ship', 'plugin']);
  });

  it('prints start usage through the Herdr action path without resolving a target cwd', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const main = vi.fn().mockResolvedValue(0);
    const runner = fakeRunner('', 1);

    await expect(runHerdrPluginAction({ argv: ['start-help'], env: {}, runner, main })).resolves.toBe(0);

    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd start <goal>');
    expect(main).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('adds absolute HERDR_BIN_PATH directory to PATH for child Herdr lookups', () => {
    vi.stubEnv('PATH', ['/usr/bin', '/bin'].join(delimiter));

    applyHerdrBinPath({ HERDR_BIN_PATH: '/opt/herdr/bin/herdr' });

    expect(process.env.PATH).toBe(['/opt/herdr/bin', '/usr/bin', '/bin'].join(delimiter));
  });

  it('does not add relative HERDR_BIN_PATH directories to PATH', () => {
    vi.stubEnv('PATH', ['/usr/bin', '/bin'].join(delimiter));

    applyHerdrBinPath({ HERDR_BIN_PATH: 'herdr' });
    applyHerdrBinPath({ HERDR_BIN_PATH: './bin/herdr' });

    expect(process.env.PATH).toBe(['/usr/bin', '/bin'].join(delimiter));
  });

  it('dispatches to the CLI with resolved cwd and propagates the exit code', async () => {
    const main = vi.fn().mockResolvedValue(3);
    const runner = fakeRunner('', 1);
    const env: PluginRuntimeEnv = {
      HERDR_PLUGIN_ROOT: '/tmp/plugin-root',
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_cwd: '/tmp/project' })
    };

    await expect(runHerdrPluginAction({ argv: ['status', '--run', 'run-1'], env, runner, main })).resolves.toBe(3);
    expect(main).toHaveBeenCalledWith(['status', '--run', 'run-1'], '/tmp/project');
  });
});

function fakeRunner(stdout: string, exitCode = 0): CommandRunner & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn().mockResolvedValue({ exitCode, stdout, stderr: '' })
  };
}
