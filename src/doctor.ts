import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolveConfigPath, loadConfig } from './config.js';
import type { CommandRunner } from './command-runner.js';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  cwd: string;
  configPath?: string;
  runner: CommandRunner;
}

export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  checks.push(await checkGitRepo(options));
  checks.push(await checkGitWorktree(options));
  checks.push(await checkCommandPresent(options, 'pi', 'Pi CLI'));
  checks.push(await checkCommandPresent(options, 'herdr', 'Herdr CLI'));
  checks.push(await checkHerdrServer(options));
  checks.push(await checkHerdrIntegration(options));
  checks.push(await checkConfig(options));

  return {
    ok: !checks.some((check) => check.status === 'fail'),
    checks
  };
}

export function formatDoctorText(report: DoctorReport): string {
  const icon: Record<CheckStatus, string> = {
    pass: 'PASS',
    warn: 'WARN',
    fail: 'FAIL'
  };
  const lines = report.checks.map((check) => `${icon[check.status]} ${check.label}: ${check.detail}`);
  lines.push(report.ok ? 'Doctor completed with no hard failures.' : 'Doctor found hard failures.');
  return `${lines.join('\n')}\n`;
}

async function checkGitRepo(options: DoctorOptions): Promise<DoctorCheck> {
  const result = await options.runner.run('git', ['rev-parse', '--show-toplevel'], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass('git.repo', 'Git repository', firstLine(result.stdout) || 'repository detected');
  }
  return fail('git.repo', 'Git repository', detailFor(result, 'not inside a git repository'));
}

async function checkGitWorktree(options: DoctorOptions): Promise<DoctorCheck> {
  const result = await options.runner.run('git', ['worktree', 'list', '--porcelain'], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass('git.worktree', 'Git worktree support', 'git worktree list succeeded');
  }
  return fail('git.worktree', 'Git worktree support', detailFor(result, 'git worktree list failed'));
}

async function checkCommandPresent(options: DoctorOptions, command: string, label: string): Promise<DoctorCheck> {
  const result = await options.runner.run(command, ['--version'], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass(`command.${command}`, label, firstLine(result.stdout) || `${command} found`);
  }
  if (result.error?.code === 'ENOENT') {
    return warn(`command.${command}`, label, `${command} was not found on PATH`);
  }
  return warn(`command.${command}`, label, detailFor(result, `${command} version check did not succeed`));
}

async function checkHerdrServer(options: DoctorOptions): Promise<DoctorCheck> {
  const result = await options.runner.run('herdr', ['workspace', 'list'], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass('herdr.server', 'Herdr server', 'workspace list succeeded');
  }
  if (result.error?.code === 'ENOENT') {
    return warn('herdr.server', 'Herdr server', 'herdr was not found on PATH');
  }
  return warn('herdr.server', 'Herdr server', detailFor(result, 'workspace list failed'));
}

async function checkHerdrIntegration(options: DoctorOptions): Promise<DoctorCheck> {
  const result = await options.runner.run('herdr', ['integration', 'status'], { cwd: options.cwd });
  if (result.exitCode === 0) {
    return pass('herdr.integration', 'Herdr Pi integration', firstLine(result.stdout) || 'integration status succeeded');
  }
  if (result.error?.code === 'ENOENT') {
    return warn('herdr.integration', 'Herdr Pi integration', 'herdr was not found on PATH');
  }
  return warn('herdr.integration', 'Herdr Pi integration', detailFor(result, 'integration status failed'));
}

async function checkConfig(options: DoctorOptions): Promise<DoctorCheck> {
  const path = resolveConfigPath(options.cwd, options.configPath);
  try {
    await access(path, constants.F_OK);
  } catch {
    if (options.configPath) {
      return fail('config', 'Config', `requested config not found at ${path}`);
    }
    return pass('config', 'Config', `no config found at ${path}; run pi-herd init to create one`);
  }
  try {
    await loadConfig(path);
    return pass('config', 'Config', `valid config at ${path}`);
  } catch (error) {
    return fail('config', 'Config', error instanceof Error ? error.message : String(error));
  }
}

function pass(id: string, label: string, detail: string): DoctorCheck {
  return { id, label, status: 'pass', detail };
}

function warn(id: string, label: string, detail: string): DoctorCheck {
  return { id, label, status: 'warn', detail };
}

function fail(id: string, label: string, detail: string): DoctorCheck {
  return { id, label, status: 'fail', detail };
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function detailFor(result: Awaited<ReturnType<CommandRunner['run']>>, fallback: string): string {
  if (result.timedOut) {
    return 'command timed out';
  }
  if (result.error?.message) {
    return result.error.message;
  }
  return firstLine(result.stderr) || firstLine(result.stdout) || fallback;
}
