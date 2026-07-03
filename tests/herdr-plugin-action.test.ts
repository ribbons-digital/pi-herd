import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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

describe('Herdr plugin manifest', () => {
  it('declares the expected metadata, pnpm build commands, and actions', async () => {
    const manifest = await readFile(join(repoRoot, 'herdr-plugin.toml'), 'utf8');

    expect(manifest).toContain('id = "ribbons-digital.pi-herd"');
    expect(manifest).toContain('name = "pi-herd"');
    expect(manifest).toContain('version = "0.1.0"');
    expect(manifest).toContain('min_herdr_version = "0.7.1"');
    expect(manifest).toContain('command = ["pnpm", "install", "--frozen-lockfile"]');
    expect(manifest).toContain('command = ["pnpm", "build"]');

    const actionIds = Array.from(manifest.matchAll(/^id = "([a-z-]+)"$/gm), (match) => match[1]).filter((id) => id !== 'ribbons-digital.pi-herd');
    expect(actionIds).toEqual(['doctor', 'start', 'status', 'collect', 'cleanup']);
    for (const action of actionIds) {
      expect(manifest).toContain(`command = ["node", "dist/herdr-plugin-action.js", "${action}"]`);
    }
  });
});

describe('Herdr plugin action wrapper', () => {
  it('resolves target cwd from focused pane context before workspace context', () => {
    const context = JSON.stringify({
      focused_pane_cwd: '/tmp/project-focused',
      workspace_cwd: '/tmp/project-workspace'
    });

    expect(cwdFromPluginContext(context)).toBe('/tmp/project-focused');
  });

  it('resolves target cwd from Herdr pane metadata when context lacks cwd fields', async () => {
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

    expect(runner.run).toHaveBeenCalledWith('/opt/herdr/bin/herdr', ['pane', 'current', '--pane', 'w1:p2'], { cwd: '/tmp/plugin-root' });
  });

  it('fails closed when no target cwd can be found', async () => {
    const runner = fakeRunner('', 1);

    await expect(resolvePluginTargetCwd({
      env: { HERDR_PLUGIN_CONTEXT_JSON: '{bad json' },
      pluginRoot: '/tmp/plugin-root',
      runner
    })).rejects.toThrow('Could not determine a target project directory');
  });

  it('builds safe CLI args for status, collect, and report-only cleanup', () => {
    expect(buildPluginCliArgs('status', ['--run', 'run-1'])).toEqual(['status', '--run', 'run-1']);
    expect(buildPluginCliArgs('collect', ['--config', 'herd.yaml'])).toEqual(['collect', '--config', 'herd.yaml']);
    expect(buildPluginCliArgs('cleanup', ['--run', 'run-1'])).toEqual(['cleanup', '--run', 'run-1']);
  });

  it('rejects destructive cleanup flags', () => {
    expect(() => buildPluginCliArgs('cleanup', ['--complete'])).toThrow('report-only');
    expect(() => buildPluginCliArgs('cleanup', ['--remove-worktrees'])).toThrow('report-only');
    expect(() => buildPluginCliArgs('cleanup', ['--force'])).toThrow('report-only');
  });

  it('requires explicit start goal text and rejects start flags', () => {
    expect(() => buildPluginCliArgs('start', [])).toThrow('Usage: pi-herd plugin start <goal>');
    expect(() => buildPluginCliArgs('start', ['--base-ref', 'main'])).toThrow('only accepts goal text');
    expect(buildPluginCliArgs('start', ['ship', 'plugin'])).toEqual(['start', 'ship', 'plugin']);
  });

  it('adds HERDR_BIN_PATH directory to PATH for child Herdr lookups', () => {
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '/usr/bin';
      applyHerdrBinPath({ HERDR_BIN_PATH: '/opt/herdr/bin/herdr' });
      expect(process.env.PATH).toBe('/opt/herdr/bin:/usr/bin');
    } finally {
      process.env.PATH = originalPath;
    }
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
