import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../src/doctor.js';
import type { CommandRunner, CommandResult } from '../src/command-runner.js';
import { serializeConfig } from '../src/config.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-doctor-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

class MockRunner implements CommandRunner {
  constructor(private readonly responses: Record<string, CommandResult>) {}

  async run(command: string, args: string[]): Promise<CommandResult> {
    return this.responses[[command, ...args].join(' ')] ?? { exitCode: 0, stdout: '', stderr: '' };
  }
}

describe('doctor', () => {
  it('returns stable json-compatible checks and ok true with only warnings', async () => {
    const runner = new MockRunner({
      'pi --version': { exitCode: null, stdout: '', stderr: '', error: Object.assign(new Error('missing'), { code: 'ENOENT' }) },
      'herdr --version': { exitCode: 0, stdout: 'herdr 0.7.1\n', stderr: '' },
      'herdr workspace list': { exitCode: 1, stdout: '', stderr: 'server unavailable\n' },
      'herdr integration status': { exitCode: 1, stdout: '', stderr: 'integration missing\n' }
    });

    const report = await runDoctor({ cwd: dir, runner });

    expect(report.ok).toBe(true);
    expect(report.checks.map((check) => check.id)).toEqual([
      'git.repo',
      'git.worktree',
      'command.pi',
      'command.herdr',
      'herdr.server',
      'herdr.integration',
      'config'
    ]);
    expect(report.checks.find((check) => check.id === 'command.pi')?.status).toBe('warn');
    expect(report.checks.find((check) => check.id === 'herdr.server')?.status).toBe('warn');
  });

  it('fails when git repo check fails', async () => {
    const runner = new MockRunner({
      'git rev-parse --show-toplevel': { exitCode: 128, stdout: '', stderr: 'not a git repo\n' }
    });

    const report = await runDoctor({ cwd: dir, runner });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'git.repo')?.status).toBe('fail');
  });

  it('fails when an explicit config path is missing', async () => {
    const runner = new MockRunner({});

    const report = await runDoctor({ cwd: dir, configPath: 'missing.yaml', runner });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'config')?.status).toBe('fail');
  });

  it('fails when config is present but invalid', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), 'schema_version: 999\n', 'utf8');
    const runner = new MockRunner({});

    const report = await runDoctor({ cwd: dir, runner });

    expect(report.ok).toBe(false);
    expect(report.checks.find((check) => check.id === 'config')?.status).toBe('fail');
  });

  it('passes when config is valid', async () => {
    await mkdir(join(dir, '.pi-herd'), { recursive: true });
    await writeFile(join(dir, '.pi-herd/config.yaml'), serializeConfig(), 'utf8');
    const runner = new MockRunner({});

    const report = await runDoctor({ cwd: dir, runner });

    expect(report.ok).toBe(true);
    expect(report.checks.find((check) => check.id === 'config')?.status).toBe('pass');
  });
});
