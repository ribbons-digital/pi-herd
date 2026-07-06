import { execFile, type ExecFileException } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

interface DistResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

describe('bundled dist entrypoints', () => {
  it('runs the Herdr action start-help entrypoint without dispatching through the CLI', async () => {
    const result = await runDist('dist/herdr-plugin-action.js', ['start-help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('plugin actions do not pass goal text');
    expect(result.stdout).toContain('pi-herd start <goal>');
    expect(result.stderr).toBe('');
  });

  it('prints normal pi-herd CLI help from the bundled CLI entrypoint', async () => {
    const result = await runDist('dist/cli.js', ['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('pi-herd run create <goal>');
    expect(result.stdout).toContain('pi-herd lead <status|brief|collect|send>');
    expect(result.stderr).toBe('');
  });

  it('runs the Herdr pane entrypoint directly for unsupported panes', async () => {
    const result = await runDist('dist/herdr-plugin-pane.js', ['missing']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('Unknown pi-herd plugin pane: missing\n');
    expect(result.stderr).toBe('');
    expect(`${result.stdout}${result.stderr}`).not.toContain('Unknown command:');
    expect(`${result.stdout}${result.stderr}`).not.toContain('pi-herd --help');
  });
});

async function runDist(entrypoint: string, args: string[]): Promise<DistResult> {
  const entrypointPath = join(repoRoot, entrypoint);
  try {
    await access(entrypointPath);
  } catch (cause) {
    throw new Error(`Expected committed distribution entrypoint ${entrypoint} to exist before running smoke tests. Distribution tests intentionally depend on committed dist files.`, { cause });
  }

  return await new Promise<DistResult>((resolve, reject) => {
    execFile(process.execPath, [entrypoint, ...args], { cwd: repoRoot, encoding: 'utf8', timeout: 5_000 }, (error: ExecFileException | null, stdout, stderr) => {
      if (error?.signal) {
        reject(error);
        return;
      }
      if (error && typeof error.code !== 'number') {
        reject(error);
        return;
      }

      resolve({
        exitCode: error?.code ?? 0,
        stdout,
        stderr
      });
    });
  });
}
