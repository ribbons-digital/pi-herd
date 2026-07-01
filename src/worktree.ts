import { access, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { CommandRunner } from './command-runner.js';
import { DEFAULT_WORKTREES_DIR, type BuiltInRole } from './defaults.js';
import type { RunState } from './run-state.js';

const WORKTREE_CREATE_TIMEOUT_MS = 120_000;

/** Options for materializing Slice 3 role worktrees without launching panes or sessions. */
export interface WorktreeMaterializeOptions {
  state: RunState;
  runner: CommandRunner;
  plannerWorktree?: boolean;
  cleanCheckIgnorePaths?: string[];
  skipCleanCheck?: boolean;
  onMaterialized?: (worktree: MaterializedWorktree) => Promise<void>;
}

/** A role worktree created by Herdr or raw git fallback. */
export interface MaterializedWorktree {
  role: BuiltInRole;
  branch: string;
  path: string;
  provider: 'herdr' | 'git';
  herdr_workspace_id: string | null;
}

/** Materialize the implementer worktree and optionally the planner worktree. */
export async function materializeWorktrees(options: WorktreeMaterializeOptions): Promise<MaterializedWorktree[]> {
  if (!options.skipCleanCheck) {
    await assertRepoClean(options.runner, options.state.repo_root, options.cleanCheckIgnorePaths);
  }
  const roles = rolesToMaterialize(options.state, options.plannerWorktree);
  const materialized: MaterializedWorktree[] = [];

  for (const role of roles) {
    const record = options.state.roles[role];
    if (!record?.branch) {
      continue;
    }
    const worktreePath = roleWorktreePath(options.state.repo_root, options.state.run_slug, role);
    await assertNoSymlinkPathComponents(options.state.repo_root, worktreePath);
    await assertPathAvailable(worktreePath);
    await assertBranchAvailable(options.runner, options.state.repo_root, record.branch);
    const result = await createWorktreeHerdrFirst({
      runner: options.runner,
      repoRoot: options.state.repo_root,
      role,
      runSlug: options.state.run_slug,
      branch: record.branch,
      baseRef: options.state.base_ref,
      path: worktreePath
    });
    record.worktree_path = result.path;
    record.worktree_status = 'materialized';
    record.worktree_provider = result.provider;
    record.herdr_workspace_id = result.herdr_workspace_id;
    materialized.push(result);
    await options.onMaterialized?.(result);
  }

  return materialized;
}

function rolesToMaterialize(state: RunState, plannerWorktree?: boolean): BuiltInRole[] {
  const roles: BuiltInRole[] = [];
  if (state.roles.implementer) {
    roles.push('implementer');
  }
  if (plannerWorktree && state.roles.planner) {
    roles.push('planner');
  }
  return roles;
}

function roleWorktreePath(repoRoot: string, runSlug: string, role: BuiltInRole): string {
  return resolve(repoRoot, DEFAULT_WORKTREES_DIR, 'pi-herd', runSlug, role);
}

/** Refuse worktree creation when the repository has uncommitted changes outside ignored paths. */
export async function assertRepoClean(runner: CommandRunner, repoRoot: string, ignorePaths: string[] = []): Promise<void> {
  const excludes = Array.from(new Set(['.pi-herd/runs', '.worktrees', ...ignorePaths].filter(Boolean))).map((path) => `:!${path}`);
  const result = await runner.run('git', ['status', '--porcelain', '--untracked-files=all', '--', '.', ...excludes], { cwd: repoRoot });
  if (result.exitCode !== 0) {
    throw new Error(`Could not check repository status: ${firstLine(result.stderr) || firstLine(result.stdout) || 'git status failed'}`);
  }
  if (result.stdout.trim()) {
    throw new Error('Repository has uncommitted changes. Commit, stash, or clean them before creating worktrees.');
  }
}

async function assertPathAvailable(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch {
    return;
  }
  throw new Error(`Worktree path already exists: ${path}`);
}

async function assertNoSymlinkPathComponents(repoRoot: string, worktreePath: string): Promise<void> {
  const relativeWorktreePath = relative(repoRoot, worktreePath);
  if (!relativeWorktreePath || relativeWorktreePath === '..' || relativeWorktreePath.startsWith(`..${sep}`) || isAbsolute(relativeWorktreePath)) {
    throw new Error('Worktree path must stay within the repository root.');
  }
  let current = repoRoot;
  for (const segment of relativeWorktreePath.split(sep)) {
    current = resolve(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error('Worktree path must not include symbolic links.');
      }
    } catch (error) {
      if (isNodeErrorWithCode(error, 'ENOENT')) {
        return;
      }
      throw error;
    }
  }
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function assertBranchAvailable(runner: CommandRunner, repoRoot: string, branch: string): Promise<void> {
  const result = await runner.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repoRoot });
  if (result.exitCode === 0) {
    throw new Error(`Branch already exists: ${branch}`);
  }
  if (result.exitCode === 1) {
    return;
  }
  throw new Error(`Could not check branch ${branch}: ${firstLine(result.stderr) || firstLine(result.stdout) || 'git show-ref failed'}`);
}

async function createWorktreeHerdrFirst(options: {
  runner: CommandRunner;
  repoRoot: string;
  role: BuiltInRole;
  runSlug: string;
  branch: string;
  baseRef: string;
  path: string;
}): Promise<MaterializedWorktree> {
  const label = `pi-herd ${options.runSlug} ${options.role}`;
  const herdr = await options.runner.run('herdr', [
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
    label,
    '--no-focus',
    '--json'
  ], { cwd: options.repoRoot, timeoutMs: WORKTREE_CREATE_TIMEOUT_MS });

  if (herdr.exitCode === 0) {
    const herdrResult = parseHerdrWorktreeResult(herdr.stdout, options);
    if (herdrResult) {
      return herdrResult;
    }
    throw new Error(`Could not create worktree for ${options.role}. Herdr: herdr worktree create returned unusable JSON metadata`);
  }
  if (herdr.timedOut) {
    throw new Error(`Could not create worktree for ${options.role}. Herdr: herdr worktree create timed out`);
  }

  const git = await options.runner.run('git', ['worktree', 'add', '-b', options.branch, options.path, options.baseRef], { cwd: options.repoRoot, timeoutMs: WORKTREE_CREATE_TIMEOUT_MS });
  if (git.exitCode !== 0) {
    const herdrDetail = firstLine(herdr.stderr) || firstLine(herdr.stdout) || herdr.error?.message || 'herdr worktree create failed';
    const gitDetail = firstLine(git.stderr) || firstLine(git.stdout) || git.error?.message || 'git worktree add failed';
    throw new Error(`Could not create worktree for ${options.role}. Herdr: ${herdrDetail}. Git: ${gitDetail}`);
  }
  return {
    role: options.role,
    branch: options.branch,
    path: options.path,
    provider: 'git',
    herdr_workspace_id: null
  };
}

function parseHerdrWorktreeResult(stdout: string, options: {
  role: BuiltInRole;
  branch: string;
  path: string;
}): MaterializedWorktree | null {
  const value = parseJsonRecord(stdout);
  for (const container of herdrMetadataContainers(value)) {
    const workspaceId = stringFromRecords([container, childRecord(container, 'workspace'), childRecord(container, 'worktree')], ['workspace_id', 'workspaceId', 'id', 'herdr_workspace_id']);
    const path = stringFromRecords([container, childRecord(container, 'worktree'), childRecord(container, 'checkout')], ['path', 'checkout_path', 'worktree_path']);
    const branch = stringFromRecords([container, childRecord(container, 'worktree'), childRecord(container, 'checkout')], ['branch', 'branch_name']);
    if (workspaceId && path && branch === options.branch && isAbsolute(path) && resolve(path) === resolve(options.path)) {
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

function herdrMetadataContainers(value: Record<string, unknown>): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [];
  const queue = [value];
  while (queue.length > 0) {
    const container = queue.shift();
    if (!container) {
      continue;
    }
    containers.push(container);
    for (const key of ['result', 'data']) {
      const child = childRecord(container, key);
      if (child) {
        queue.push(child);
      }
    }
  }
  return containers;
}

function childRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const child = value[key];
  if (child && typeof child === 'object' && !Array.isArray(child)) {
    return child as Record<string, unknown>;
  }
  return null;
}

function stringFromRecords(records: Array<Record<string, unknown> | null>, keys: string[]): string | null {
  for (const record of records) {
    if (!record) {
      continue;
    }
    for (const key of keys) {
      const item = record[key];
      if (typeof item === 'string' && item.length > 0) {
        return item;
      }
    }
  }
  return null;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}
