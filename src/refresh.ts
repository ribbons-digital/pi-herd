import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { OUTPUT_BUDGETS, type RoleName } from './defaults.js';
import { firstLine } from './herdr.js';
import { assertNoSymlinkPathComponents, materializeRoleWorktree, roleWorktreePath } from './worktree.js';
import { resolveRunContext, updateRunState, type RoleRecord, type RunState } from './run-state.js';

export interface RefreshOptions {
  cwd: string;
  configPath?: string;
  run?: string;
  role: RoleName;
  force?: boolean;
  runner?: CommandRunner;
}

export interface DiffOptions {
  cwd: string;
  configPath?: string;
  run?: string;
  runner?: CommandRunner;
}

export interface CommandTextResult {
  state: RunState;
  text: string;
}

export interface SourceDiff {
  role: RoleName;
  branch: string;
  range: string;
  statLines: string[];
  nameStatusLines: string[];
}

export async function refreshRole(options: RefreshOptions): Promise<CommandTextResult> {
  if (options.role !== 'reviewer' && options.role !== 'tester') {
    throw new Error('Refresh only supports reviewer or tester roles.');
  }
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const record = resolved.state.roles[options.role];
  if (!record) {
    throw new Error(`Role ${options.role} is not selected for run ${resolved.state.run_id}.`);
  }
  const implementationBranch = implementationBranchFor(resolved.state);
  await assertRefExists(runner, resolved.state.repo_root, implementationBranch, 'implementation branch has not been created yet');

  const notes: string[] = [];
  if (record.status === 'working' && !options.force) {
    throw new Error(`Refusing to refresh ${options.role} while it is working. Re-run with --force to override.`);
  }

  const expectedPath = roleWorktreePath(resolved.state.repo_root, resolved.state.run_id, options.role);
  const storedPathExists = record.worktree_path ? await exists(record.worktree_path) : false;
  const expectedPathExists = await exists(expectedPath);
  if (record.worktree_status !== 'materialized' || !record.worktree_path || !storedPathExists) {
    if (record.worktree_status === 'materialized' && record.worktree_path && !storedPathExists) {
      notes.push(`Stored ${options.role} worktree path is missing; recreating it.`);
    }
    if (expectedPathExists) {
      await assertNoSymlinkPathComponents(resolved.state.repo_root, expectedPath);
      record.worktree_path = expectedPath;
      record.worktree_status = 'materialized';
      record.worktree_provider = record.worktree_provider ?? 'git';
      notes.push(`Reused existing ${options.role} worktree at ${expectedPath}.`);
    } else if (await localBranchExists(runner, resolved.state.repo_root, record.branch ?? '')) {
      await assertNoSymlinkPathComponents(resolved.state.repo_root, expectedPath);
      await gitWorktreePruneStale(runner, resolved.state.repo_root);
      await gitWorktreeAddExistingBranch(runner, resolved.state.repo_root, expectedPath, record.branch!);
      record.worktree_path = expectedPath;
      record.worktree_status = 'materialized';
      record.worktree_provider = record.worktree_provider ?? 'git';
      notes.push(`Recreated ${options.role} worktree at ${expectedPath}.`);
    } else {
      record.worktree_path = null;
      record.worktree_status = 'pending';
      record.worktree_provider = null;
      record.worktree_herdr_workspace_id = null;
      await materializeRoleWorktree({
        state: resolved.state,
        runner,
        role: options.role,
        baseRef: implementationBranch,
        cleanCheckIgnorePaths: ['.pi-herd/runs', '.worktrees'],
        onMaterialized: async () => {
          await updateRoleWorktreeState(resolved.statePath, resolved.state, options.role);
        }
      });
      notes.push(`Materialized ${options.role} worktree at ${record.worktree_path}.`);
    }
  }

  if (!record.worktree_path) {
    throw new Error(`Role ${options.role} has no worktree path after materialization.`);
  }

  await assertNoSymlinkPathComponents(resolved.state.repo_root, record.worktree_path);
  await assertExpectedRoleWorktree(runner, record.worktree_path, record.branch, expectedPath, options.role, resolved.state.repo_root);

  const commits = await commitsAheadOfImplementation(runner, record.worktree_path, implementationBranch);
  if (commits.count > 0 && !options.force) {
    throw new Error(`Refusing to refresh ${options.role} worktree with ${commits.count} committed change(s) not in ${implementationBranch}. Commits:\n${formatBoundedLines(commits.lines)}\nRe-run with --force to reset and clean it.`);
  }
  if (commits.count > 0 && options.force) {
    notes.push(`Force refreshing ${options.role} worktree with ${commits.count} committed change(s) not in ${implementationBranch}. Commits:\n${formatBoundedLines(commits.lines)}`);
  }

  const dirty = await dirtyPaths(runner, record.worktree_path);
  if (dirty.length && !options.force) {
    throw new Error(`Refusing to refresh dirty ${options.role} worktree. Dirty paths:\n${formatBoundedLines(dirty)}\nRe-run with --force to reset and clean it.`);
  }
  if (dirty.length && options.force) {
    notes.push(`Force refreshing dirty ${options.role} worktree. Dirty paths:\n${formatBoundedLines(dirty)}`);
  }

  if (options.force) {
    const backupRef = await backupRefFor(runner, record.worktree_path, options.role, resolved.state.run_id);
    await git(runner, 'save reviewer/tester worktree backup ref', ['update-ref', backupRef, 'HEAD'], record.worktree_path);
    notes.push(`Saved ${options.role} backup ref ${backupRef}.`);
    if (dirty.length) {
      const stashRef = await stashDirtyWorktree(runner, record.worktree_path, options.role, resolved.state.run_id);
      notes.push(`Saved ${options.role} dirty work stash ${stashRef} (refs/stash).`);
    }
  }
  await git(runner, 'reset reviewer/tester worktree', ['reset', '--hard', implementationBranch], record.worktree_path);
  if (options.force) {
    await git(runner, 'clean reviewer/tester worktree', ['clean', '-fd'], record.worktree_path);
  }

  const updated = await updateRunState(resolved.statePath, (fresh) => {
    const freshRecord = fresh.roles[options.role];
    if (!freshRecord) return;
    freshRecord.source_ref = implementationBranch;
    freshRecord.worktree_path = record.worktree_path;
    freshRecord.worktree_status = 'materialized';
    freshRecord.worktree_provider = record.worktree_provider ?? 'git';
    freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id ?? null;
    freshRecord.herdr_workspace_id = record.herdr_workspace_id;
  });

  return {
    state: updated,
    text: [`Refreshed ${options.role} from ${implementationBranch}.`, ...notes].join('\n') + '\n'
  };
}

export async function diffRun(options: DiffOptions): Promise<CommandTextResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner });
  const diffs = await sourceDiffs(runner, resolved.state);
  if (diffs.length === 1) {
    const diff = diffs[0];
    const lines = [
      `Diff for ${resolved.state.run_id}`,
      `Range: ${diff.range}`,
      '',
      '## Stat',
      ...(diff.statLines.length ? diff.statLines : ['No changes.']),
      '',
      '## Files',
      ...(diff.nameStatusLines.length ? diff.nameStatusLines : ['No changed files.'])
    ];
    return { state: resolved.state, text: `${formatBoundedLines(lines)}\n` };
  }
  const lines = [`Diff for ${resolved.state.run_id}`];
  for (const diff of diffs) {
    lines.push(
      '',
      `## Source ${diff.role}`,
      `Branch: ${diff.branch}`,
      `Range: ${diff.range}`,
      '',
      '### Stat',
      ...(diff.statLines.length ? diff.statLines : ['No changes.']),
      '',
      '### Files',
      ...(diff.nameStatusLines.length ? diff.nameStatusLines : ['No changed files.'])
    );
  }
  return { state: resolved.state, text: `${formatBoundedLines(lines)}\n` };
}

export async function dirtyPaths(runner: CommandRunner, worktreePath: string): Promise<string[]> {
  const result = await runner.run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: worktreePath });
  if (result.exitCode !== 0) {
    throw new Error(`Could not check worktree status: ${firstLine(result.stderr) || firstLine(result.stdout) || 'git status failed'}`);
  }
  return result.stdout.trim() ? result.stdout.trimEnd().split(/\r?\n/) : [];
}

async function commitsAheadOfImplementation(
  runner: CommandRunner,
  worktreePath: string,
  implementationBranch: string
): Promise<{ count: number; lines: string[] }> {
  const range = `${implementationBranch}..HEAD`;
  const countResult = await runner.run('git', ['rev-list', '--count', range], { cwd: worktreePath });
  if (countResult.exitCode !== 0) {
    throw new Error(`Could not check committed worktree changes: ${firstLine(countResult.stderr) || firstLine(countResult.stdout) || 'git rev-list failed'}`);
  }
  const count = Number.parseInt(countResult.stdout.trim(), 10);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Could not parse committed worktree change count: ${firstLine(countResult.stdout) || 'empty output'}`);
  }
  if (count === 0) return { count, lines: [] };
  const logResult = await runner.run('git', ['log', '--oneline', `--max-count=${OUTPUT_BUDGETS.terminalSummaryLines}`, range], { cwd: worktreePath });
  if (logResult.exitCode !== 0) {
    throw new Error(`Could not list committed worktree changes: ${firstLine(logResult.stderr) || firstLine(logResult.stdout) || 'git log failed'}`);
  }
  return { count, lines: logResult.stdout.trim() ? logResult.stdout.trimEnd().split(/\r?\n/) : [`${count} commit(s)`] };
}

export async function implementationDiff(runner: CommandRunner, state: RunState): Promise<{ implementationBranch: string; range: string; statLines: string[]; nameStatusLines: string[] }> {
  const diff = (await sourceDiffs(runner, state))[0];
  return {
    implementationBranch: diff.branch,
    range: diff.range,
    statLines: diff.statLines,
    nameStatusLines: diff.nameStatusLines
  };
}

export async function sourceDiffs(runner: CommandRunner, state: RunState): Promise<SourceDiff[]> {
  return Promise.all(sourceRoleRecords(state).map(async (record) => {
    const branch = record.branch;
    if (!branch) {
      throw new Error(`Source role ${record.role} branch is unavailable.`);
    }
    await assertRefExists(runner, state.repo_root, branch, `${record.role} source branch has not been created yet`);
    const range = `${state.base_ref}...${branch}`;
    const [stat, names] = await Promise.all([
      git(runner, `show ${record.role} source diff stat`, ['diff', '--stat', range], state.repo_root),
      git(runner, `show ${record.role} source changed files`, ['diff', '--name-status', range], state.repo_root)
    ]);
    return {
      role: record.role,
      branch,
      range,
      statLines: stat.stdout.trim() ? stat.stdout.trimEnd().split(/\r?\n/) : [],
      nameStatusLines: names.stdout.trim() ? names.stdout.trimEnd().split(/\r?\n/) : []
    };
  }));
}

function sourceRoleRecords(state: RunState): RoleRecord[] {
  const implementer = state.roles.implementer;
  if (implementer?.expected_writes !== 'worktree' || !implementer.branch) {
    throw new Error('Implementation branch is unavailable because the implementer role is not selected.');
  }
  const records: RoleRecord[] = [implementer];
  for (const role of state.role_order ?? Object.keys(state.roles)) {
    if (role === 'implementer') {
      continue;
    }
    const record = state.roles[role];
    if (record?.expected_writes === 'worktree') {
      records.push(record);
    }
  }
  return records;
}

export function implementationBranchFor(state: RunState): string {
  const branch = state.roles.implementer?.branch;
  if (!branch) {
    throw new Error('Implementation branch is unavailable because the implementer role is not selected.');
  }
  return branch;
}

async function updateRoleWorktreeState(statePath: string, state: RunState, role: RoleName): Promise<void> {
  const record = state.roles[role];
  await updateRunState(statePath, (fresh) => {
    const freshRecord = fresh.roles[role];
    if (!freshRecord || !record) return;
    freshRecord.worktree_path = record.worktree_path;
    freshRecord.worktree_status = record.worktree_status;
    freshRecord.worktree_provider = record.worktree_provider;
    freshRecord.worktree_herdr_workspace_id = record.worktree_herdr_workspace_id;
    freshRecord.herdr_workspace_id = record.herdr_workspace_id;
  });
}

async function assertRefExists(runner: CommandRunner, repoRoot: string, ref: string, message: string): Promise<void> {
  const result = await runner.run('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoRoot });
  if (result.exitCode === 0) return;
  throw new Error(`${message}: ${ref}`);
}

async function localBranchExists(runner: CommandRunner, repoRoot: string, branch: string): Promise<boolean> {
  if (!branch) return false;
  const result = await runner.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repoRoot });
  return result.exitCode === 0;
}

async function gitWorktreePruneStale(runner: CommandRunner, repoRoot: string): Promise<void> {
  await git(runner, 'prune stale worktree registrations', ['worktree', 'prune', '--expire', 'now'], repoRoot);
}

async function gitWorktreeAddExistingBranch(runner: CommandRunner, repoRoot: string, path: string, branch: string): Promise<void> {
  await git(runner, `recreate ${branch} worktree`, ['worktree', 'add', path, branch], repoRoot);
}

export async function assertExpectedRoleWorktree(
  runner: CommandRunner,
  worktreePath: string,
  branch: string | undefined,
  expectedPath: string,
  role: RoleName,
  repoRoot: string
): Promise<void> {
  if (resolve(worktreePath) !== resolve(expectedPath)) {
    throw new Error(`Refusing to refresh ${role} worktree at unexpected path ${worktreePath}. Expected ${expectedPath}.`);
  }
  if (!branch) {
    throw new Error(`Refusing to refresh ${role} worktree because its role branch is unavailable.`);
  }
  const root = await git(runner, 'validate reviewer/tester worktree root', ['rev-parse', '--show-toplevel'], worktreePath);
  if (resolve(root.stdout.trim()) !== resolve(worktreePath)) {
    throw new Error(`Refusing to refresh ${role} worktree because ${worktreePath} is not its git worktree root.`);
  }
  const repoCommonDir = await gitCommonDir(runner, repoRoot);
  const worktreeCommonDir = await gitCommonDir(runner, worktreePath);
  if (repoCommonDir !== worktreeCommonDir) {
    throw new Error(`Refusing to refresh ${role} worktree because it does not belong to the run repository.`);
  }
  const currentBranch = await git(runner, 'validate reviewer/tester worktree branch', ['symbolic-ref', '--short', 'HEAD'], worktreePath);
  if (currentBranch.stdout.trim() !== branch) {
    throw new Error(`Refusing to refresh ${role} worktree because it is on ${currentBranch.stdout.trim() || 'detached HEAD'} instead of ${branch}.`);
  }
}

async function gitCommonDir(runner: CommandRunner, cwd: string): Promise<string> {
  const result = await git(runner, 'validate repository identity', ['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd);
  return resolve(result.stdout.trim());
}

async function stashDirtyWorktree(runner: CommandRunner, worktreePath: string, role: RoleName, runId: string): Promise<string> {
  await git(runner, 'stash dirty reviewer/tester worktree changes', ['stash', 'push', '--include-untracked', '--message', `pi-herd ${role} refresh backup ${runId}`], worktreePath);
  const result = await git(runner, 'resolve reviewer/tester dirty work stash', ['rev-parse', '--verify', 'refs/stash'], worktreePath);
  return result.stdout.trim();
}

export async function git(runner: CommandRunner, label: string, args: string[], cwd: string) {
  const result = await runner.run('git', args, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(`Could not ${label}: ${firstLine(result.stderr) || firstLine(result.stdout) || 'git failed'}`);
  }
  return result;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function backupRefFor(runner: CommandRunner, worktreePath: string, role: RoleName, runId: string): Promise<string> {
  const head = await git(runner, 'resolve reviewer/tester worktree HEAD for backup ref', ['rev-parse', '--short=12', 'HEAD'], worktreePath);
  return `refs/pi-herd/backup/${role}/${runId}/${head.stdout.trim()}-${randomUUID()}`;
}

export function formatBoundedLines(lines: string[]): string {
  const budget = OUTPUT_BUDGETS.terminalSummaryLines;
  if (lines.length <= budget) return lines.join('\n');
  return [...lines.slice(0, budget), `... truncated ${lines.length - budget} line(s) ...`].join('\n');
}
