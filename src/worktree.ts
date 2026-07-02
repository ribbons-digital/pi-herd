import { access, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { CommandRunner } from './command-runner.js';
import { firstLine, parseWorktreeCreateResult, worktreeCreate, HERDR_WORKTREE_CREATE_TIMEOUT_MS } from './herdr.js';
import { DEFAULT_WORKTREES_DIR, type BuiltInRole } from './defaults.js';
import type { RunState } from './run-state.js';

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
    const baseRef = role === 'reviewer' || role === 'tester' ? options.state.roles[role]?.source_ref : options.state.base_ref;
    const result = await materializeRoleWorktree({ ...options, role, baseRef, skipCleanCheck: true });
    materialized.push(result);
  }

  return materialized;
}

/** Materialize one role worktree, using source_ref for reviewer/tester activation when provided. */
export async function materializeRoleWorktree(options: WorktreeMaterializeOptions & { role: BuiltInRole; baseRef?: string }): Promise<MaterializedWorktree> {
  if (!options.skipCleanCheck) {
    await assertRepoClean(options.runner, options.state.repo_root, options.cleanCheckIgnorePaths);
  }
  const record = options.state.roles[options.role];
  if (!record?.branch) {
    throw new Error(`Role ${options.role} is not selected for this run.`);
  }
  if (record.worktree_status === 'materialized' && record.worktree_path) {
    return {
      role: options.role,
      branch: record.branch,
      path: record.worktree_path,
      provider: record.worktree_provider ?? 'git',
      herdr_workspace_id: record.worktree_herdr_workspace_id ?? null
    };
  }
  const baseRef = options.baseRef ?? record.source_ref ?? options.state.base_ref;
  if (record.source_ref) {
    await assertRefAvailable(options.runner, options.state.repo_root, baseRef, options.role);
  }
  const worktreePath = roleWorktreePath(options.state.repo_root, options.state.run_id, options.role);
  await assertNoSymlinkPathComponents(options.state.repo_root, worktreePath);
  await assertPathAvailable(worktreePath);
  await assertBranchAvailable(options.runner, options.state.repo_root, record.branch);
  const result = await createWorktreeHerdrFirst({
    runner: options.runner,
    repoRoot: options.state.repo_root,
    role: options.role,
    runSlug: options.state.run_slug,
    branch: record.branch,
    baseRef,
    path: worktreePath
  });
  record.worktree_path = result.path;
  record.worktree_status = 'materialized';
  record.worktree_provider = result.provider;
  record.worktree_herdr_workspace_id = result.herdr_workspace_id;
  record.herdr_workspace_id = result.herdr_workspace_id;
  await options.onMaterialized?.(result);
  return result;
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

export function roleWorktreePath(repoRoot: string, runId: string, role: BuiltInRole): string {
  return resolve(repoRoot, DEFAULT_WORKTREES_DIR, 'pi-herd', runId, role);
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

export async function assertNoSymlinkPathComponents(repoRoot: string, worktreePath: string): Promise<void> {
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

async function assertRefAvailable(runner: CommandRunner, repoRoot: string, ref: string, role: BuiltInRole): Promise<void> {
  const result = await runner.run('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoRoot });
  if (result.exitCode === 0) {
    return;
  }
  throw new Error(`Cannot materialize ${role} worktree because source ref '${ref}' is unavailable.`);
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
  const herdr = await worktreeCreate(options.runner, options.repoRoot, {
    repoRoot: options.repoRoot,
    branch: options.branch,
    baseRef: options.baseRef,
    path: options.path,
    label
  });

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

  const git = await options.runner.run('git', ['worktree', 'add', '-b', options.branch, options.path, options.baseRef], { cwd: options.repoRoot, timeoutMs: HERDR_WORKTREE_CREATE_TIMEOUT_MS });
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
  return parseWorktreeCreateResult(stdout, {
    role: options.role,
    branch: options.branch,
    path: options.path,
    isAbsolutePath: isAbsolute,
    normalizePath: resolve
  });
}

