import { access, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultConfig, loadConfig, resolveConfigPath } from './config.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { DEFAULT_RUNS_DIR, ROLE_DEFAULTS, type BuiltInRole } from './defaults.js';
import { assertRepoClean, materializeWorktrees, type MaterializedWorktree } from './worktree.js';

export type RunStatus = 'active' | 'completed' | 'abandoned' | 'failed';
export type RoleStatus = 'pending' | 'staged' | 'working' | 'done' | 'incomplete' | 'blocked' | 'failed';
export type WorktreeStatus = 'pending' | 'materialized';

/** Options for creating a canonical run state directory without launching workers. */
export interface RunCreateOptions {
  cwd: string;
  goal: string;
  configPath?: string;
  roles?: BuiltInRole[];
  baseRef?: string;
  now?: Date;
  withWorktrees?: boolean;
  plannerWorktree?: boolean;
  runner?: CommandRunner;
}

/** Files and directories created for a new run. */
export interface RunCreateResult {
  state: RunState;
  requestPath: string;
  statePath: string;
  inboxDir: string;
  logsDir: string;
  created: string[];
  worktrees: MaterializedWorktree[];
}

export interface LeadBinding {
  role: 'lead';
  harness: string;
  herdr_workspace_id: string | null;
  herdr_tab_id: string | null;
  herdr_pane_id: string | null;
  session_ref: string | null;
}

export interface RoleRecord {
  role: BuiltInRole;
  status: RoleStatus;
  harness: string;
  branch?: string;
  source_ref?: string;
  worktree_path: string | null;
  worktree_status: WorktreeStatus;
  herdr_workspace_id: string | null;
  herdr_tab_id: string | null;
  herdr_pane_id: string | null;
  session_ref: string | null;
  required_artifacts: string[];
  last_activity_at: string | null;
}

/** Persisted schema_version 1 state for a pi-herd orchestration run. */
export interface RunState {
  schema_version: 1;
  run_id: string;
  run_slug: string;
  goal: string;
  status: RunStatus;
  created_at: string;
  updated_at: string;
  repo_root: string;
  base_ref: string;
  canonical_run_dir: string;
  lead_binding: LeadBinding;
  roles: Partial<Record<BuiltInRole, RoleRecord>>;
}

/** Minimal active-run data used for implicit and explicit run selection. */
export interface ActiveRunSummary {
  run_id: string;
  run_slug: string;
  goal: string;
  status: RunStatus;
  created_at: string;
  canonical_run_dir: string;
}

/** Create run artifacts and optional worktrees, but no panes or sessions. */
export async function createRun(options: RunCreateOptions): Promise<RunCreateResult> {
  const goal = options.goal.trim();
  if (!goal) {
    throw new Error('Run goal must be a non-empty string.');
  }

  const runner = options.runner ?? nodeCommandRunner;
  const repoRoot = await resolveRepoRoot(options.cwd, runner);
  const config = await loadConfigIfPresent(options.configPath ? options.cwd : repoRoot, options.configPath);
  const runsRoot = resolveRunsRoot(repoRoot, config.paths.runs_dir || DEFAULT_RUNS_DIR);
  await assertNoSymlinkPathComponents(repoRoot, runsRoot);
  const cleanCheckIgnorePaths = [relative(repoRoot, runsRoot), '.worktrees'];
  if (options.withWorktrees) {
    await assertRepoClean(runner, repoRoot, cleanCheckIgnorePaths);
  }
  const now = options.now ?? new Date();
  const createdAt = now.toISOString();
  const baseSlug = slugify(goal);
  const timestamp = formatRunTimestamp(now);
  const { runId, runSlug, runDir } = await allocateRunDirectory(repoRoot, runsRoot, timestamp, baseSlug);
  const inboxDir = join(runDir, 'inbox');
  const logsDir = join(runDir, 'logs');
  const requestPath = join(runDir, 'REQUEST.md');
  const statePath = join(runDir, 'state.json');
  const created: string[] = [runDir];
  await mkdir(inboxDir, { recursive: true });
  created.push(inboxDir);
  await mkdir(logsDir, { recursive: true });
  created.push(logsDir);

  const harness = config.harness.default;
  const roles = uniqueRoles(options.roles?.length ? options.roles : ['planner', 'implementer', 'reviewer', 'tester']);
  const state: RunState = {
    schema_version: 1,
    run_id: runId,
    run_slug: runSlug,
    goal,
    status: 'active',
    created_at: createdAt,
    updated_at: createdAt,
    repo_root: repoRoot,
    base_ref: options.baseRef ?? await resolveBaseRef(repoRoot, runner),
    canonical_run_dir: runDir,
    lead_binding: {
      role: 'lead',
      harness,
      herdr_workspace_id: null,
      herdr_tab_id: null,
      herdr_pane_id: null,
      session_ref: null
    },
    roles: Object.create(null) as Partial<Record<BuiltInRole, RoleRecord>>
  };

  for (const role of roles) {
    state.roles[role] = createRoleRecord(role, harness, runSlug);
  }

  await writeFile(requestPath, formatRequest(state), 'utf8');
  created.push(requestPath);
  await writeJsonAtomic(statePath, state);
  created.push(statePath);

  let worktrees: MaterializedWorktree[] = [];
  if (options.withWorktrees) {
    try {
      worktrees = await materializeWorktrees({
        state,
        runner,
        plannerWorktree: options.plannerWorktree,
        cleanCheckIgnorePaths,
        onMaterialized: async () => {
          state.updated_at = new Date().toISOString();
          await writeJsonAtomic(statePath, state);
        }
      });
    } catch (error) {
      state.status = 'failed';
      state.updated_at = new Date().toISOString();
      await writeJsonAtomic(statePath, state);
      throw error;
    }
  }

  return { state, requestPath, statePath, inboxDir, logsDir, created, worktrees };
}

/** Return active runs sorted by creation time, ignoring non-active runs. */
export async function listActiveRuns(cwd: string, configPath?: string, runner: CommandRunner = nodeCommandRunner): Promise<ActiveRunSummary[]> {
  const repoRoot = await resolveRepoRoot(cwd, runner);
  const config = await loadConfigIfPresent(configPath ? cwd : repoRoot, configPath);
  const runsRoot = resolveRunsRoot(repoRoot, config.paths.runs_dir || DEFAULT_RUNS_DIR);
  await assertNoSymlinkPathComponents(repoRoot, runsRoot);
  let entries: string[];
  try {
    entries = await readdir(runsRoot);
  } catch {
    return [];
  }
  const active: ActiveRunSummary[] = [];
  for (const entry of entries) {
    try {
      const state = await readRunState(join(runsRoot, entry, 'state.json'));
      if (state.status === 'active') {
        active.push(toSummary(state));
      }
    } catch {
      continue;
    }
  }
  return active.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Resolve an explicit run selector or the only active run, failing on ambiguity. */
export async function resolveActiveRun(cwd: string, selector?: string, configPath?: string, runner: CommandRunner = nodeCommandRunner): Promise<ActiveRunSummary> {
  const activeRuns = await listActiveRuns(cwd, configPath, runner);
  if (selector) {
    if (selector === 'latest') {
      if (!activeRuns.length) {
        throw new Error('No active runs found.');
      }
      return activeRuns[activeRuns.length - 1];
    }
    const matches = activeRuns.filter((run) => run.run_id === selector || run.run_slug === selector);
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(`Run selector '${selector}' is ambiguous. Pass a run_id.\n${formatRunChoices(matches)}`);
    }
    throw new Error(`No active run matched '${selector}'.`);
  }
  if (activeRuns.length === 1) {
    return activeRuns[0];
  }
  if (!activeRuns.length) {
    throw new Error('No active runs found.');
  }
  throw new Error(`Multiple active runs found. Pass --run <run_id|slug>.\n${formatRunChoices(activeRuns)}`);
}

/** Format the human-readable result for `pi-herd run create`. */
export function formatRunCreateText(result: RunCreateResult): string {
  const lines = [
    `Created run ${result.state.run_id}`,
    `Goal: ${result.state.goal}`,
    `Run directory: ${result.state.canonical_run_dir}`,
    `Request: ${result.requestPath}`,
    `State: ${result.statePath}`,
    `Inbox: ${result.inboxDir}`,
    `Logs: ${result.logsDir}`
  ];
  for (const worktree of result.worktrees) {
    lines.push(`Worktree ${worktree.role}: ${worktree.path} (${worktree.branch}, ${worktree.provider})`);
  }
  return `${lines.join('\n')}\n`;
}

/** Parse a CLI role flag into a supported built-in Slice 2 role. */
export function parseRole(value: string): BuiltInRole {
  if (value === 'planner' || value === 'implementer' || value === 'reviewer' || value === 'tester') {
    return value;
  }
  throw new Error(`Unknown role '${value}'. Expected planner, implementer, reviewer, or tester.`);
}

async function loadConfigIfPresent(cwd: string, configPath?: string) {
  const path = resolveConfigPath(cwd, configPath);
  try {
    await access(path, constants.F_OK);
  } catch {
    if (configPath) {
      throw new Error(`Config not found at ${path}.`);
    }
    return defaultConfig();
  }
  return loadConfig(path);
}

async function resolveRepoRoot(cwd: string, runner: CommandRunner): Promise<string> {
  const result = await runner.run('git', ['rev-parse', '--show-toplevel'], { cwd });
  if (result.exitCode === 0) {
    return result.stdout.trim() || resolve(cwd);
  }
  return resolve(cwd);
}

function resolveRunsRoot(repoRoot: string, runsDir: string): string {
  if (isAbsolute(runsDir)) {
    throw new Error('Config paths.runs_dir must be a repository-relative path.');
  }
  const runsRoot = resolve(repoRoot, runsDir);
  if (!isPathInside(repoRoot, runsRoot)) {
    throw new Error('Config paths.runs_dir must stay within the repository root.');
  }
  return runsRoot;
}

async function assertNoSymlinkPathComponents(repoRoot: string, runsRoot: string): Promise<void> {
  const relativeRunsRoot = relative(repoRoot, runsRoot);
  if (!relativeRunsRoot) {
    return;
  }
  let current = repoRoot;
  for (const segment of relativeRunsRoot.split(sep)) {
    current = join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error('Config paths.runs_dir must not include symbolic links.');
      }
    } catch (error) {
      if (isNodeErrorWithCode(error, 'ENOENT')) {
        return;
      }
      throw error;
    }
  }
}

async function assertRealPathInsideRepo(repoRoot: string, runsRoot: string): Promise<void> {
  const [realRepoRoot, realRunsRoot] = await Promise.all([realpath(repoRoot), realpath(runsRoot)]);
  if (!isPathInside(realRepoRoot, realRunsRoot)) {
    throw new Error('Config paths.runs_dir must stay within the repository root.');
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relativeCandidate = relative(root, candidate);
  return relativeCandidate === '' || (!relativeCandidate.startsWith(`..${sep}`) && relativeCandidate !== '..' && !isAbsolute(relativeCandidate));
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function resolveBaseRef(repoRoot: string, runner: CommandRunner): Promise<string> {
  const branch = await runner.run('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: repoRoot });
  if (branch.exitCode === 0 && branch.stdout.trim()) {
    return branch.stdout.trim();
  }
  const commit = await runner.run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot });
  if (commit.exitCode === 0 && commit.stdout.trim()) {
    return commit.stdout.trim();
  }
  return 'main';
}

function formatRunTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-');
}

async function allocateRunDirectory(repoRoot: string, runsRoot: string, timestamp: string, baseSlug: string): Promise<{ runId: string; runSlug: string; runDir: string }> {
  await mkdir(runsRoot, { recursive: true });
  await assertRealPathInsideRepo(repoRoot, runsRoot);
  for (let index = 1; index < 1000; index += 1) {
    const runSlug = index === 1 ? baseSlug : `${baseSlug}-${index}`;
    const runId = `${timestamp}-${runSlug}`;
    const runDir = join(runsRoot, runId);
    try {
      await mkdir(runDir);
      return { runId, runSlug, runDir };
    } catch {
      continue;
    }
  }
  const runSlug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
  const runId = `${timestamp}-${runSlug}`;
  const runDir = join(runsRoot, runId);
  await mkdir(runDir);
  return { runId, runSlug, runDir };
}

function createRoleRecord(role: BuiltInRole, harness: string, runSlug: string): RoleRecord {
  const defaults = ROLE_DEFAULTS[role];
  const implementationBranch = `pi-herd/${runSlug}/impl`;
  return {
    role,
    status: 'pending',
    harness,
    branch: role === 'implementer' ? implementationBranch : `pi-herd/${runSlug}/${role}`,
    source_ref: role === 'reviewer' || role === 'tester' ? implementationBranch : undefined,
    worktree_path: null,
    worktree_status: 'pending',
    herdr_workspace_id: null,
    herdr_tab_id: null,
    herdr_pane_id: null,
    session_ref: null,
    required_artifacts: [...defaults.requiredArtifacts],
    last_activity_at: null
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'run';
}

function uniqueRoles(roles: BuiltInRole[]): BuiltInRole[] {
  return Array.from(new Set(roles));
}

function formatRequest(state: RunState): string {
  return `# Request\n\nGoal: ${state.goal}\n\nRun ID: ${state.run_id}\nCreated: ${state.created_at}\nBase ref: ${state.base_ref}\n\n## Instructions\n\nThis file captures the original user goal for the run.\nWorker artifacts should be written to this canonical run directory.\nWorker requests should be written to inbox files named {timestamp}-{from_role}-{kind}.md.\n`;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = join(dirname(path), `.tmp-${process.pid}-${Date.now()}-${randomUUID()}.json`);
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(tempPath, path);
}

async function readRunState(path: string): Promise<RunState> {
  return JSON.parse(await readFile(path, 'utf8')) as RunState;
}

function toSummary(state: RunState): ActiveRunSummary {
  return {
    run_id: state.run_id,
    run_slug: state.run_slug,
    goal: state.goal,
    status: state.status,
    created_at: state.created_at,
    canonical_run_dir: state.canonical_run_dir
  };
}

function formatRunChoices(runs: ActiveRunSummary[]): string {
  return runs.map((run) => `- ${run.run_id} (${run.run_slug}): ${run.goal}`).join('\n');
}
