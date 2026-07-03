import { access, readFile, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { OUTPUT_BUDGETS } from './defaults.js';
import { describeFailure, paneClose, paneGet, worktreeRemove } from './herdr.js';
import { backupRefFor, formatBoundedLines, git, implementationDiff, assertExpectedRoleWorktree } from './refresh.js';
import { resolveRunContext, updateRunState, type RoleRecord, type RunState } from './run-state.js';
import { buildSnapshot, type RunSnapshot } from './status.js';
import { assertNoSymlinkPathComponents, roleWorktreePath } from './worktree.js';

export interface MergePlanOptions {
  cwd: string;
  configPath?: string;
  run?: string;
  json?: boolean;
  runner?: CommandRunner;
  now?: Date;
}

export interface CleanupOptions extends MergePlanOptions {
  complete?: boolean;
  abandon?: boolean;
  closePanes?: boolean;
  removeWorktrees?: boolean;
  force?: boolean;
}

export interface LifecycleCommandResult {
  state: RunState;
  snapshot: RunSnapshot;
  text: string;
  exitCode: number;
  mergeDecisionPath?: string;
  actions?: string[];
  warnings?: string[];
}

export async function mergePlanRun(options: MergePlanOptions): Promise<LifecycleCommandResult> {
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner, includeAllForExplicitRun: true });
  const snapshot = await buildSnapshot(resolved.state, runner, options.now ?? new Date(), true);
  const diff = await implementationDiff(runner, resolved.state);
  const mergeDecisionPath = `${resolved.state.canonical_run_dir}/MERGE_DECISION.md`;
  const content = await formatMergeDecision(resolved.state, snapshot, diff, options.now ?? new Date());
  await writeText(mergeDecisionPath, content);
  const result = {
    state: resolved.state,
    snapshot,
    mergeDecisionPath,
    text: options.json ? '' : `${formatMergePlanText(resolved.state, snapshot, mergeDecisionPath)}\n`,
    exitCode: 0
  };
  if (options.json) {
    result.text = `${JSON.stringify({ run_id: resolved.state.run_id, path: mergeDecisionPath, snapshot }, null, 2)}\n`;
  }
  return result;
}

export async function cleanupRun(options: CleanupOptions): Promise<LifecycleCommandResult> {
  if (options.complete && options.abandon) {
    throw new Error('Choose only one of --complete or --abandon.');
  }
  const runner = options.runner ?? nodeCommandRunner;
  const resolved = await resolveRunContext({ cwd: options.cwd, run: options.run, configPath: options.configPath, runner, includeAllForExplicitRun: true });
  const snapshot = await buildSnapshot(resolved.state, runner, options.now ?? new Date(), true);
  const actions: string[] = [];
  const warnings: string[] = [...snapshot.warnings];
  const mutating = Boolean(options.closePanes || options.removeWorktrees || options.complete || options.abandon);

  if (!mutating) {
    return formatCleanupResult(resolved.state, snapshot, actions, warnings, options, 'report');
  }

  let state = resolved.state;
  if (options.closePanes) {
    for (const roleSnapshot of snapshot.roles) {
      if (isWorkingRole(roleSnapshot) && !options.force) {
        throw new Error(`Refusing to close working ${roleSnapshot.role} pane. Re-run with --force to override.`);
      }
    }
    for (const record of roleEntries(resolved.state)) {
      if (!record.herdr_pane_id) continue;
      if (record.herdr_pane_id === resolved.state.lead_binding.herdr_pane_id) {
        warnings.push(`Skipped ${record.role} pane ${record.herdr_pane_id} because it matches the lead pane.`);
        continue;
      }
      const pane = await paneGet(runner, resolved.state.repo_root, record.herdr_pane_id);
      if (pane.exitCode !== 0) {
        warnings.push(`Could not verify ${record.role} pane ${record.herdr_pane_id}: ${describeFailure(pane, 'pane get failed')}`);
        continue;
      }
      const closed = await paneClose(runner, resolved.state.repo_root, record.herdr_pane_id);
      if (closed.exitCode !== 0) {
        warnings.push(`Could not close ${record.role} pane ${record.herdr_pane_id}: ${describeFailure(closed, 'pane close failed')}`);
        continue;
      }
      actions.push(`Closed ${record.role} pane ${record.herdr_pane_id}.`);
      state = await updateRunState(resolved.statePath, (fresh) => {
        const freshRecord = fresh.roles[record.role];
        if (!freshRecord) return;
        freshRecord.herdr_pane_id = null;
        freshRecord.herdr_tab_id = null;
        freshRecord.herdr_workspace_id = null;
        freshRecord.session_ref = null;
      });
    }
  }

  if (options.removeWorktrees) {
    for (const roleSnapshot of snapshot.roles) {
      if (isWorkingRole(roleSnapshot) && !options.force) {
        throw new Error(`Refusing to remove working ${roleSnapshot.role} worktree. Re-run with --force to override.`);
      }
    }
    for (const record of roleEntries(resolved.state)) {
      if (record.worktree_status !== 'materialized' || !record.worktree_path) continue;
      const removed = await removeRoleWorktree(resolved.state, record, runner, Boolean(options.force));
      actions.push(...removed.actions);
      warnings.push(...removed.warnings);
      if (removed.removed) {
        state = await updateRunState(resolved.statePath, (fresh) => {
          const freshRecord = fresh.roles[record.role];
          if (!freshRecord) return;
          freshRecord.worktree_path = null;
          freshRecord.worktree_status = 'pending';
          freshRecord.worktree_provider = null;
          freshRecord.worktree_herdr_workspace_id = null;
        });
      }
    }
  }

  if (options.complete || options.abandon) {
    const nextStatus = options.complete ? 'completed' : 'abandoned';
    state = await updateRunState(resolved.statePath, (fresh) => {
      fresh.status = nextStatus;
    });
    actions.push(`Marked run ${nextStatus}.`);
  }

  const finalSnapshot = await buildSnapshot(state, runner, options.now ?? new Date(), true);
  const finalWarnings = Array.from(new Set([...warnings, ...finalSnapshot.warnings]));
  return formatCleanupResult(state, finalSnapshot, actions, finalWarnings, options, 'applied');
}

async function removeRoleWorktree(state: RunState, record: RoleRecord, runner: CommandRunner, force: boolean): Promise<{ actions: string[]; warnings: string[]; removed: boolean }> {
  const actions: string[] = [];
  const warnings: string[] = [];
  if (!record.worktree_path) return { actions, warnings, removed: false };
  const expectedPath = roleWorktreePath(state.repo_root, state.run_id, record.role);
  try {
    await assertNoSymlinkPathComponents(state.repo_root, record.worktree_path);
    await assertExpectedRoleWorktree(runner, record.worktree_path, record.branch, expectedPath, record.role, state.repo_root);
  } catch (error) {
    if (await exists(record.worktree_path)) throw error;
    warnings.push(`Stored ${record.role} worktree path is missing: ${record.worktree_path}.`);
    actions.push(`Cleared missing ${record.role} worktree state.`);
    return { actions, warnings, removed: true };
  }

  const dirty = await cleanupDirtyPaths(runner, record.worktree_path);
  if (dirty.length && !force) {
    throw new Error(`Refusing to remove dirty ${record.role} worktree. Dirty paths:\n${formatBoundedLines(dirty)}\nRe-run with --force to preserve and remove it.`);
  }
  if (force) {
    const backupRef = await backupRefFor(runner, record.worktree_path, record.role, state.run_id);
    await git(runner, `save ${record.role} worktree cleanup backup ref`, ['update-ref', backupRef, 'HEAD'], record.worktree_path);
    actions.push(`Saved ${record.role} backup ref ${backupRef}.`);
    if (dirty.length) {
      await git(runner, `stash dirty ${record.role} worktree before removal`, ['stash', 'push', '--all', '--message', `pi-herd ${record.role} cleanup backup ${state.run_id}`], record.worktree_path);
      const stash = await git(runner, `resolve ${record.role} cleanup stash`, ['rev-parse', '--verify', 'refs/stash'], record.worktree_path);
      actions.push(`Saved ${record.role} dirty work stash ${stash.stdout.trim()} (refs/stash).`);
    }
  }

  let removed = false;
  if (record.worktree_provider === 'herdr' && record.worktree_herdr_workspace_id) {
    const result = await worktreeRemove(runner, state.repo_root, { workspaceId: record.worktree_herdr_workspace_id, force });
    if (result.exitCode === 0) {
      removed = true;
      actions.push(`Removed ${record.role} Herdr worktree workspace ${record.worktree_herdr_workspace_id}.`);
    } else {
      warnings.push(`Herdr could not remove ${record.role} worktree; falling back to git: ${describeFailure(result, 'herdr worktree remove failed')}`);
    }
  }
  if (!removed) {
    await git(runner, `remove ${record.role} worktree`, ['worktree', 'remove', ...(force ? ['--force'] : []), record.worktree_path], state.repo_root);
    actions.push(`Removed ${record.role} git worktree ${record.worktree_path}.`);
  }

  return { actions, warnings, removed: true };
}

async function formatMergeDecision(
  state: RunState,
  snapshot: RunSnapshot,
  diff: Awaited<ReturnType<typeof implementationDiff>>,
  now: Date
): Promise<string> {
  const reviewerExcerpt = await artifactExcerpt(state, 'REVIEW.md');
  const testerExcerpt = await artifactExcerpt(state, 'TEST_REPORT.md');
  const finalSummaryExists = await exists(`${state.canonical_run_dir}/FINAL_SUMMARY.md`);
  const lines = [
    '# Merge Decision',
    '',
    `Generated: ${now.toISOString()}`,
    `Run: ${state.run_id}`,
    `State revision: ${state.state_revision ?? 'untracked'}`,
    `Goal: ${state.goal}`,
    `Status: ${state.status}`,
    '',
    '## Source',
    '',
    `Base ref: ${state.base_ref}`,
    `Implementation branch: ${diff.implementationBranch}`,
    `Diff range: ${diff.range}`,
    `Full diff command: git diff ${diff.range}`,
    '',
    '## Diff stat',
    '',
    ...(boundedMarkdownLines(diff.statLines.length ? diff.statLines : ['No changes.'])),
    '',
    '## Changed files',
    '',
    ...(boundedMarkdownLines(diff.nameStatusLines.length ? diff.nameStatusLines : ['No changed files.'])),
    '',
    '## Role context',
    '',
    ...snapshot.roles.map((role) => `- ${role.role}: stored=${role.stored_status}; evaluated=${role.evaluated_status}; signal=${role.signal}`),
    '',
    '## Reviewer artifact excerpt',
    '',
    reviewerExcerpt,
    '',
    '## Tester artifact excerpt',
    '',
    testerExcerpt,
    '',
    '## Warnings',
    '',
    ...(allWarnings(snapshot).length ? allWarnings(snapshot).map((warning) => `- ${warning}`) : ['- None.']),
    '',
    '## Final summary',
    '',
    finalSummaryExists ? `${state.canonical_run_dir}/FINAL_SUMMARY.md` : 'FINAL_SUMMARY.md not found. Run `pi-herd collect` before final merge review if needed.',
    '',
    '## Manual next steps',
    '',
    '1. Inspect this file, FINAL_SUMMARY.md, REVIEW.md, TEST_REPORT.md, and the implementation diff.',
    `2. If approved, merge ${diff.implementationBranch} into the intended target branch manually.`,
    '3. Run project validation in the target branch after merge.',
    '4. Run `pi-herd cleanup --complete` after the run is accepted, or `pi-herd cleanup --abandon` if it is not.',
    ''
  ];
  return `${lines.join('\n')}\n`;
}

async function cleanupDirtyPaths(runner: CommandRunner, worktreePath: string): Promise<string[]> {
  const result = await git(runner, 'check cleanup worktree status', ['status', '--porcelain', '--untracked-files=all', '--ignored=matching'], worktreePath);
  return result.stdout.trim() ? result.stdout.trimEnd().split(/\r?\n/) : [];
}

function formatMergePlanText(state: RunState, snapshot: RunSnapshot, path: string): string {
  const lines = [
    `Wrote ${path}`,
    `Run: ${state.run_id}`,
    `Status: ${state.status}`
  ];
  const warnings = allWarnings(snapshot);
  if (warnings.length) {
    lines.push('Warnings:', ...warnings.slice(0, OUTPUT_BUDGETS.terminalSummaryLines).map((warning) => `- ${warning}`));
  }
  return lines.join('\n');
}

function formatCleanupResult(
  state: RunState,
  snapshot: RunSnapshot,
  actions: string[],
  warnings: string[],
  options: CleanupOptions,
  mode: 'report' | 'applied'
): LifecycleCommandResult {
  const report = cleanupReport(state, snapshot, actions, warnings, mode);
  return {
    state,
    snapshot,
    actions,
    warnings,
    text: options.json ? `${JSON.stringify({ mode, run_id: state.run_id, status: state.status, actions, warnings, snapshot }, null, 2)}\n` : report,
    exitCode: 0
  };
}

function cleanupReport(state: RunState, snapshot: RunSnapshot, actions: string[], warnings: string[], mode: 'report' | 'applied'): string {
  const lines = [
    mode === 'report' ? `Cleanup report for ${state.run_id}` : `Cleanup applied for ${state.run_id}`,
    `Status: ${state.status}`,
    '',
    '## Candidates',
    `Worker panes: ${roleEntries(state).filter((role) => role.herdr_pane_id).length}`,
    `Materialized worktrees: ${roleEntries(state).filter((role) => role.worktree_status === 'materialized' && role.worktree_path).length}`,
    '',
    '## Actions',
    ...(actions.length ? actions : ['No changes made.']),
    '',
    '## Warnings',
    ...(warnings.length ? warnings : ['None.'])
  ];
  if (mode === 'report') {
    lines.push('', 'Run with --close-panes, --remove-worktrees, --complete, or --abandon to apply cleanup actions.');
  }
  lines.push('');
  return lines.join('\n');
}

function isWorkingRole(role: RunSnapshot['roles'][number]): boolean {
  return role.stored_status === 'working' || role.evaluated_status === 'working' || role.signal === 'working';
}

function roleEntries(state: RunState): RoleRecord[] {
  return Object.values(state.roles).filter((role): role is RoleRecord => Boolean(role));
}

function allWarnings(snapshot: RunSnapshot): string[] {
  return Array.from(new Set(snapshot.warnings));
}

function boundedMarkdownLines(lines: string[]): string[] {
  const budget = OUTPUT_BUDGETS.terminalSummaryLines;
  if (lines.length <= budget) return lines;
  return [...lines.slice(0, budget), `... truncated ${lines.length - budget} line(s) ...`];
}

async function artifactExcerpt(state: RunState, name: string): Promise<string> {
  const path = `${state.canonical_run_dir}/${name}`;
  try {
    const content = await readFile(path, 'utf8');
    const trimmed = content.trim();
    if (!trimmed) return `${name} is empty.`;
    return trimmed.length > OUTPUT_BUDGETS.artifactPreviewBytes ? `${trimmed.slice(0, OUTPUT_BUDGETS.artifactPreviewBytes)}\n... truncated ...` : trimmed;
  } catch {
    return `${name} not found.`;
  }
}

async function writeText(path: string, content: string): Promise<void> {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

