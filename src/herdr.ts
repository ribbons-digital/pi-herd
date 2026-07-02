import type { CommandResult, CommandRunner } from './command-runner.js';
import type { BuiltInRole } from './defaults.js';

export const HERDR_LAUNCH_TIMEOUT_MS = 30_000;
export const HERDR_PROMPT_TIMEOUT_MS = 10_000;
export const HERDR_READY_WAIT_TIMEOUT_MS = 15_000;
export const HERDR_READY_RUNNER_TIMEOUT_MS = 20_000;
export const HERDR_WORKTREE_CREATE_TIMEOUT_MS = 120_000;

export interface PaneMetadata {
  paneId: string | null;
  workspaceId: string | null;
  tabId: string | null;
}

export interface ParsedWorktreeCreateResult {
  role: BuiltInRole;
  branch: string;
  path: string;
  provider: 'herdr';
  herdr_workspace_id: string;
}

export function workspaceCreate(runner: CommandRunner, cwd: string, options: { repoRoot: string; label: string }): Promise<CommandResult> {
  return runner.run('herdr', ['workspace', 'create', '--cwd', options.repoRoot, '--label', options.label, '--no-focus'], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}

export function agentStart(runner: CommandRunner, cwd: string, options: { name: string; sessionCwd: string; workspaceId: string; command: string; args: string[] }): Promise<CommandResult> {
  return runner.run('herdr', [
    'agent', 'start', options.name,
    '--cwd', options.sessionCwd,
    '--workspace', options.workspaceId,
    '--split', 'down',
    '--no-focus',
    '--', options.command,
    ...options.args
  ], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}

export function paneSplit(runner: CommandRunner, cwd: string, options: { parentPaneId: string; sessionCwd: string }): Promise<CommandResult> {
  return runner.run('herdr', ['pane', 'split', options.parentPaneId, '--direction', 'down', '--cwd', options.sessionCwd, '--no-focus'], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}

export function paneRun(runner: CommandRunner, cwd: string, paneId: string, command: string, args: string[]): Promise<CommandResult> {
  return runner.run('herdr', ['pane', 'run', paneId, command, ...args], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}

export function paneCurrent(runner: CommandRunner, cwd: string): Promise<CommandResult> {
  return runner.run('herdr', ['pane', 'current', '--current'], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}

/** Verify that the current Herdr pane matches an expected pane id. */
export async function verifyCurrentPane(runner: CommandRunner, cwd: string, paneId: string): Promise<{ workspaceId: string | null; tabId: string | null } | null> {
  const current = await paneCurrent(runner, cwd);
  if (current.exitCode !== 0) {
    return null;
  }
  const metadata = parsePaneMetadata(current.stdout);
  if (metadata.paneId !== paneId) {
    return null;
  }
  return { workspaceId: metadata.workspaceId, tabId: metadata.tabId };
}

export function paneGet(runner: CommandRunner, cwd: string, paneId: string): Promise<CommandResult> {
  return runner.run('herdr', ['pane', 'get', paneId], { cwd, timeoutMs: HERDR_LAUNCH_TIMEOUT_MS });
}

export function paneSendText(runner: CommandRunner, cwd: string, paneId: string, message: string): Promise<CommandResult> {
  return runner.run('herdr', ['pane', 'send-text', paneId, message], { cwd, timeoutMs: HERDR_PROMPT_TIMEOUT_MS });
}

export function paneSendEnter(runner: CommandRunner, cwd: string, paneId: string): Promise<CommandResult> {
  return runner.run('herdr', ['pane', 'send-keys', paneId, 'enter'], { cwd, timeoutMs: HERDR_PROMPT_TIMEOUT_MS });
}

export function waitAgentStatus(runner: CommandRunner, cwd: string, paneId: string, status: 'idle' | 'working' | 'blocked' | 'done' | 'unknown' = 'idle', timeoutMs = HERDR_READY_WAIT_TIMEOUT_MS): Promise<CommandResult> {
  return runner.run('herdr', ['wait', 'agent-status', paneId, '--status', status, '--timeout', String(timeoutMs)], { cwd, timeoutMs: HERDR_READY_RUNNER_TIMEOUT_MS });
}

export function worktreeCreate(runner: CommandRunner, cwd: string, options: { repoRoot: string; branch: string; baseRef: string; path: string; label: string }): Promise<CommandResult> {
  return runner.run('herdr', [
    'worktree',
    'create',
    '--cwd',
    options.repoRoot,
    '--branch',
    options.branch,
    '--base',
    options.baseRef,
    '--path',
    options.path,
    '--label',
    options.label,
    '--no-focus',
    '--json'
  ], { cwd, timeoutMs: HERDR_WORKTREE_CREATE_TIMEOUT_MS });
}

export function parsePaneMetadata(stdout: string): PaneMetadata {
  const parsed = parseJsonRecord(stdout);
  const records = metadataContainers(parsed, ['result', 'data', 'pane', 'agent', 'workspace', 'terminal']);
  return {
    paneId: explicitPaneIdFromRecords(records),
    workspaceId: stringFromRecords(records, ['workspace_id', 'workspaceId', 'herdr_workspace_id']),
    tabId: stringFromRecords(records, ['tab_id', 'tabId', 'herdr_tab_id'])
  };
}

export function parseWorktreeCreateResult(stdout: string, options: { role: BuiltInRole; branch: string; path: string; isAbsolutePath: (path: string) => boolean; normalizePath: (path: string) => string }): ParsedWorktreeCreateResult | null {
  const value = parseJsonRecord(stdout);
  for (const container of metadataContainers(value, ['result', 'data'])) {
    const workspaceId = stringFromNullableRecords([container, childRecord(container, 'workspace'), childRecord(container, 'worktree')], ['workspace_id', 'workspaceId', 'id', 'herdr_workspace_id']);
    const path = stringFromNullableRecords([container, childRecord(container, 'worktree'), childRecord(container, 'checkout')], ['path', 'checkout_path', 'worktree_path']);
    const branch = stringFromNullableRecords([container, childRecord(container, 'worktree'), childRecord(container, 'checkout')], ['branch', 'branch_name']);
    if (workspaceId && path && branch === options.branch && options.isAbsolutePath(path) && options.normalizePath(path) === options.normalizePath(options.path)) {
      return {
        role: options.role,
        branch: options.branch,
        path: options.path,
        provider: 'herdr',
        herdr_workspace_id: workspaceId
      };
    }
  }
  return null;
}

export function describeFailure(result: CommandResult, fallback: string): string {
  if (result.error) {
    return result.error.code ? `${result.error.code}: ${result.error.message}` : result.error.message;
  }
  if (result.timedOut) {
    return `${fallback} timed out`;
  }
  return firstLine(result.stderr) || firstLine(result.stdout) || fallback;
}

export function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

function parseJsonRecord(stdout: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return Object.create(null) as Record<string, unknown>;
  }
  return Object.create(null) as Record<string, unknown>;
}

function metadataContainers(value: Record<string, unknown>, childKeys: string[]): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [];
  const queue = [value];
  while (queue.length) {
    const container = queue.shift();
    if (!container) continue;
    containers.push(container);
    for (const key of childKeys) {
      const child = childRecord(container, key);
      if (child) {
        queue.push(child);
      }
    }
  }
  return containers;
}

function explicitPaneIdFromRecords(records: Record<string, unknown>[]): string | null {
  return stringFromRecords(records, ['pane_id', 'paneId', 'herdr_pane_id']) ?? stringFromPaneContainers(records);
}

function stringFromPaneContainers(records: Record<string, unknown>[]): string | null {
  for (const record of records) {
    for (const key of ['pane', 'terminal']) {
      const child = childRecord(record, key);
      if (child) {
        const id = child.id;
        if (typeof id === 'string' && id.length > 0) {
          return id;
        }
      }
    }
  }
  return null;
}

function childRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const child = value[key];
  if (child && typeof child === 'object' && !Array.isArray(child)) {
    return child as Record<string, unknown>;
  }
  return null;
}

function stringFromRecords(records: Record<string, unknown>[], keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  }
  return null;
}

function stringFromNullableRecords(records: Array<Record<string, unknown> | null>, keys: string[]): string | null {
  return stringFromRecords(records.filter(Boolean) as Record<string, unknown>[], keys);
}
