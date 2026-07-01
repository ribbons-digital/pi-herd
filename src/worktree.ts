import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { CommandRunner } from './command-runner.js';
import { DEFAULT_WORKTREES_DIR, type BuiltInRole } from './defaults.js';
import type { RunState } from './run-state.js';

export interface WorktreeMaterializeOptions {
  state: RunState;
  runner: CommandRunner;
  plannerWorktree?: boolean;
  cleanCheckIgnorePaths?: string[];
  onMaterialized?: (worktree: MaterializedWorktree) => Promise<void>;
}

export interface MaterializedWorktree {
  role: BuiltInRole;
  branch: string;
  path: string;
  provider: 'herdr' | 'git';
  herdr_workspace_id: string | null;
}

export async function materializeWorktrees(options: WorktreeMaterializeOptions): Promise<MaterializedWorktree[]> {
  await assertRepoClean(options.runner, options.state.repo_root, options.cleanCheckIgnorePaths);
  const roles = rolesToMaterialize(options.state, options.plannerWorktree);
  const materialized: MaterializedWorktree[] = [];

  for (const role of roles) {
    const record = options.state.roles[role];
    if (!record?.branch) {
      continue;
    }
    const worktreePath = roleWorktreePath(options.state.repo_root, options.state.run_slug, role);
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

export async function assertRepoClean(runner: CommandRunner, repoRoot: string, ignorePaths: string[] = []): Promise<void> {
  const excludes = Array.from(new Set(['.pi-herd/runs', '.worktrees', ...ignorePaths])).map((path) => `:!${path}`);
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
  ], { cwd: options.repoRoot });

  const herdrResult = herdr.exitCode === 0 ? parseHerdrWorktreeResult(herdr.stdout, options) : null;
  if (herdrResult) {
    return herdrResult;
  }

  const git = await options.runner.run('git', ['worktree', 'add', '-b', options.branch, options.path, options.baseRef], { cwd: options.repoRoot });
  if (git.exitCode !== 0) {
    const herdrDetail = herdr.exitCode === 0
      ? 'herdr worktree create returned unusable JSON metadata'
      : firstLine(herdr.stderr) || firstLine(herdr.stdout) || herdr.error?.message || 'herdr worktree create failed';
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
  const workspaceId = stringFromAny(value, ['workspace_id', 'workspaceId', 'id', 'herdr_workspace_id']);
  const path = stringFromAny(value, ['path', 'checkout_path', 'worktree_path']);
  const branch = stringFromAny(value, ['branch', 'branch_name']);
  if (!workspaceId || !path || !isAbsolute(path) || resolve(path) !== resolve(options.path) || (branch && branch !== options.branch)) {
    return null;
  }
  return {
    role: options.role,
    branch: options.branch,
    path: options.path,
    provider: 'herdr',
    herdr_workspace_id: workspaceId
  };
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

function stringFromAny(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const item = value[key];
    if (typeof item === 'string' && item.length > 0) {
      return item;
    }
  }
  return null;
}

function firstLine(value: string): string | undefined {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}
