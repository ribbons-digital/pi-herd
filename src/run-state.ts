import { access, lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultConfig, loadConfig, resolveConfigPath, type PiHerdConfig } from './config.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { DEFAULT_RUNS_DIR, DEFAULT_WORKTREES_DIR, ROLE_DEFAULTS, type BuiltInRole } from './defaults.js';
import { assertRepoClean, materializeWorktrees, type MaterializedWorktree } from './worktree.js';
import { firstLine, verifyCurrentPane } from './herdr.js';

export type RunStatus = 'active' | 'completed' | 'abandoned' | 'failed';
export type RoleStatus = 'pending' | 'staged' | 'working' | 'done' | 'incomplete' | 'blocked' | 'failed';
export type WorktreeStatus = 'pending' | 'materialized';

/** Options for creating canonical run artifacts and optional role worktrees without launching workers. */
export interface RunCreateOptions {
  cwd: string;
  goal: string;
  configPath?: string;
  roles?: BuiltInRole[];
  baseRef?: string;
  now?: Date;
  /** Materialize the implementer worktree when the implementer role is selected. */
  withWorktrees?: boolean;
  /** Also materialize the planner worktree when worktree creation is enabled and the planner role is selected. */
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
  config: PiHerdConfig;
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
  worktree_provider?: 'herdr' | 'git' | null;
  worktree_herdr_workspace_id?: string | null;
  herdr_workspace_id: string | null;
  herdr_tab_id: string | null;
  herdr_pane_id: string | null;
  session_ref: string | null;
  launch_metadata?: LaunchMetadata;
  required_artifacts: string[];
  last_activity_at: string | null;
  /** Prompt pass counter; 0 until the first prompt is sent, missing on legacy state. */
  pass?: number;
}

/** Additive session launch details persisted after Herdr/Pi launch steps succeed. */
export interface LaunchMetadata {
  agent_name?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  model?: string | null;
  provider?: string | null;
  thinking?: string | null;
  expected_writes?: string;
  launch_method?: 'herdr-agent-start' | 'herdr-pane-run' | 'bound-current-pane';
  prompt_method?: 'pane-send-text-enter';
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
  /** Additive revision provenance incremented by locked read-modify-write updates. */
  state_revision?: number;
  repo_root: string;
  base_ref: string;
  canonical_run_dir: string;
  lead_binding: LeadBinding;
  roles: Partial<Record<BuiltInRole, RoleRecord>>;
}

/** Minimal run data used for run listing and active-run selection. */
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
    state.roles[role] = createRoleRecord(role, harness, runId);
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
        cleanCheckIgnorePaths: [...cleanCheckIgnorePaths, relative(repoRoot, runDir)],
        skipCleanCheck: true,
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

  return { state, requestPath, statePath, inboxDir, logsDir, created, worktrees, config };
}

export interface ResolveRunContextOptions {
  cwd: string;
  run?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  runner?: CommandRunner;
  includeAllForExplicitRun?: boolean;
}

export interface ResolvedRunContext {
  state: RunState;
  statePath: string;
  summary: ActiveRunSummary;
}

/** Return runs sorted by creation time. Defaults to active runs only. */
export async function listRuns(cwd: string, configPath?: string, runner: CommandRunner = nodeCommandRunner, includeAll = false): Promise<ActiveRunSummary[]> {
  const repoRoot = await resolveRepoRoot(cwd, runner);
  const config = await loadConfigIfPresent(configPath ? cwd : repoRoot, configPath);
  const runsRoot = resolveRunsRoot(repoRoot, config.paths.runs_dir || DEFAULT_RUNS_DIR);
  await assertNoSymlinkPathComponents(repoRoot, runsRoot);
  return listRunsInRoot(runsRoot, includeAll);
}

/** Return active runs sorted by creation time, ignoring non-active runs. */
export async function listActiveRuns(cwd: string, configPath?: string, runner: CommandRunner = nodeCommandRunner): Promise<ActiveRunSummary[]> {
  return listRuns(cwd, configPath, runner, false);
}

/** Resolve an explicit run selector or the only active run, failing on ambiguity. */
export async function resolveActiveRun(cwd: string, selector?: string, configPath?: string, runner: CommandRunner = nodeCommandRunner): Promise<ActiveRunSummary> {
  return selectRunFromSummaries(await listActiveRuns(cwd, configPath, runner), selector);
}

/** Resolve a run state from explicit selector, verified current pane, or single active run. */
export async function resolveRunContext(options: ResolveRunContextOptions): Promise<ResolvedRunContext> {
  const runner = options.runner ?? nodeCommandRunner;
  const activeRuns = await listRunsForInvocation(options.cwd, options.configPath, runner, false);
  let summary: ActiveRunSummary;
  if (options.run) {
    const runs = options.includeAllForExplicitRun ? await listRunsForInvocation(options.cwd, options.configPath, runner, true) : activeRuns;
    summary = selectRunFromSummaries(runs, options.run, options.includeAllForExplicitRun ? 'runs' : 'active runs');
  } else {
    const paneMatch = await resolveRunByCurrentPane(options, activeRuns, runner);
    summary = paneMatch ?? selectRunFromSummaries(activeRuns);
  }
  const statePath = join(summary.canonical_run_dir, 'state.json');
  return { state: await readRunState(statePath), statePath, summary };
}

/** List runs visible from a main checkout or role worktree invocation directory. */
export async function listRunsForInvocation(cwd: string, configPath?: string, runner: CommandRunner = nodeCommandRunner, includeAll = false): Promise<ActiveRunSummary[]> {
  const primaryCwd = resolve(cwd);
  const seen = new Set<string>();
  const runs: ActiveRunSummary[] = [];
  for (const candidate of await invocationRunSearchCwds(cwd, runner)) {
    try {
      for (const run of await listRuns(candidate, configPath, runner, includeAll)) {
        if (!seen.has(run.canonical_run_dir)) {
          seen.add(run.canonical_run_dir);
          runs.push(run);
        }
      }
    } catch (error) {
      if (candidate === primaryCwd) {
        throw error;
      }
    }
  }
  return runs.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Select an explicit run, latest run, or the single visible active run from summaries. */
export function selectRunFromSummaries(runs: ActiveRunSummary[], selector?: string, noun = 'active runs'): ActiveRunSummary {
  if (selector) {
    if (selector === 'latest') {
      const latest = runs.at(-1);
      if (!latest) throw new Error(`No ${noun} found.`);
      return latest;
    }
    const matches = runs.filter((run) => run.run_id === selector || run.run_slug === selector);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Run selector '${selector}' is ambiguous. Pass a run_id.\n${formatRunChoices(matches)}`);
    throw new Error(`No ${noun.slice(0, -1)} matched '${selector}'.`);
  }
  if (runs.length === 1) return runs[0];
  if (!runs.length) throw new Error(`No ${noun} found.`);
  throw new Error(`Multiple active runs found. Pass --run <run_id|slug>.\n${formatRunChoices(runs)}`);
}

async function listRunsInRoot(runsRoot: string, includeAll: boolean): Promise<ActiveRunSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(runsRoot);
  } catch {
    return [];
  }
  const runs: ActiveRunSummary[] = [];
  for (const entry of entries) {
    try {
      const state = await readRunState(join(runsRoot, entry, 'state.json'));
      if (includeAll || state.status === 'active') {
        runs.push(toSummary(state));
      }
    } catch {
      continue;
    }
  }
  return runs.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function resolveRunByCurrentPane(options: ResolveRunContextOptions, runs: ActiveRunSummary[], runner: CommandRunner): Promise<ActiveRunSummary | null> {
  const env = options.env ?? process.env;
  if (env.HERDR_ENV !== '1' || !env.HERDR_PANE_ID || env.PI_CODING_AGENT !== 'true') {
    return null;
  }
  const matches: ActiveRunSummary[] = [];
  for (const run of runs) {
    const state = await readRunState(join(run.canonical_run_dir, 'state.json'));
    const verified = await verifyCurrentPane(runner, state.repo_root, env.HERDR_PANE_ID);
    if (!verified) continue;
    if (state.lead_binding.herdr_pane_id === env.HERDR_PANE_ID || Object.values(state.roles).some((role) => role?.herdr_pane_id === env.HERDR_PANE_ID)) {
      matches.push(run);
    }
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Current pane matches multiple active runs. Pass --run <run_id|slug>.\n${formatRunChoices(matches)}`);
  return null;
}

async function invocationRunSearchCwds(cwd: string, runner: CommandRunner): Promise<string[]> {
  const candidates = [resolve(cwd)];
  const gitCommonRoot = await inferCanonicalRootFromGitCommonDir(cwd, runner);
  if (gitCommonRoot) candidates.push(gitCommonRoot);
  const fallbackRoot = inferCanonicalRootFromWorktreePath(cwd);
  if (fallbackRoot) candidates.push(fallbackRoot);
  return Array.from(new Set(candidates));
}

async function inferCanonicalRootFromGitCommonDir(cwd: string, runner: CommandRunner): Promise<string | null> {
  let result;
  try {
    result = await runner.run('git', ['rev-parse', '--git-common-dir'], { cwd });
  } catch {
    return null;
  }
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }
  const commonDir = resolve(cwd, result.stdout.trim());
  if (basename(commonDir) !== '.git') {
    return null;
  }
  return dirname(commonDir);
}

function inferCanonicalRootFromWorktreePath(cwd: string): string | null {
  const absolute = resolve(cwd);
  const parts = absolute.split(sep);
  const markerParts = DEFAULT_WORKTREES_DIR.split(/[\\/]+/).filter(Boolean);
  for (let markerIndex = parts.length - markerParts.length; markerIndex > 0; markerIndex -= 1) {
    if (!markerParts.every((part, offset) => parts[markerIndex + offset] === part)) continue;
    const piHerdIndex = markerIndex + markerParts.length;
    if (parts[piHerdIndex] !== 'pi-herd' || parts.length < piHerdIndex + 3) continue;
    const root = parts.slice(0, markerIndex).join(sep) || sep;
    if (!root || root === absolute || !isAbsolute(root)) return null;
    return root;
  }
  return null;
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

/** Load config when present, otherwise return defaults for the provided cwd. */
export async function loadConfigIfPresent(cwd: string, configPath?: string) {
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
  if (result.exitCode === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  throw new Error(`Not inside a git repository: ${firstLine(result.stderr) || firstLine(result.stdout) || result.error?.message || 'git rev-parse --show-toplevel failed'}`);
}

/** Resolve the configured repository-relative runs directory under the repo root. */
export function resolveRunsRoot(repoRoot: string, runsDir: string): string {
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
  throw new Error(`Could not resolve base ref: ${firstLine(commit.stderr) || firstLine(commit.stdout) || commit.error?.message || 'git rev-parse --short HEAD failed'}`);
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
    } catch (error) {
      if (isNodeErrorWithCode(error, 'EEXIST')) {
        continue;
      }
      throw error;
    }
  }
  const runSlug = `${baseSlug}-${randomUUID().slice(0, 8)}`;
  const runId = `${timestamp}-${runSlug}`;
  const runDir = join(runsRoot, runId);
  await mkdir(runDir);
  return { runId, runSlug, runDir };
}

function createRoleRecord(role: BuiltInRole, harness: string, runId: string): RoleRecord {
  const defaults = ROLE_DEFAULTS[role];
  const implementationBranch = `pi-herd/${runId}/impl`;
  return {
    role,
    status: 'pending',
    harness,
    branch: role === 'implementer' ? implementationBranch : `pi-herd/${runId}/${role}`,
    source_ref: role === 'reviewer' || role === 'tester' ? implementationBranch : undefined,
    worktree_path: null,
    worktree_status: 'pending',
    worktree_provider: null,
    herdr_workspace_id: null,
    herdr_tab_id: null,
    herdr_pane_id: null,
    session_ref: null,
    required_artifacts: [...defaults.requiredArtifacts],
    last_activity_at: null,
    pass: 0
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

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = join(dirname(path), `.tmp-${process.pid}-${Date.now()}-${randomUUID()}.json`);
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(tempPath, path);
}

/**
 * Lock, re-read, mutate synchronously, and atomically write run state.
 * Mutators must not return thenables or await caller-provided work while the state lock is held.
 * Mutators should only change fields owned by their command to avoid reintroducing lost updates.
 * Returning false skips the atomic write and revision bump when the fresh state no longer needs a change.
 */
type NonThenable<T> = T extends PromiseLike<unknown> ? never : T;

type RunStateMutator<T> = (state: RunState) => NonThenable<T>;

export async function updateRunState<T>(path: string, mutate: RunStateMutator<T>): Promise<RunState> {
  const lockDir = join(dirname(path), '.state.lock');
  const lock = await acquireStateLock(lockDir);
  try {
    const state = await readRunState(path);
    const mutationResult = mutate(state);
    if (isThenable(mutationResult)) {
      throw new Error('Run state mutators must be synchronous');
    }
    await assertStateLockOwned(lock);
    if (mutationResult === false) {
      return state;
    }
    state.updated_at = new Date().toISOString();
    state.state_revision = (state.state_revision ?? 0) + 1;
    await writeJsonAtomicWithStateLock(path, state, lock);
    return state;
  } finally {
    await releaseStateLock(lock);
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

async function writeJsonAtomicWithStateLock(path: string, value: unknown, lock: StateLock): Promise<void> {
  const tempPath = join(lock.lockDir, `.tmp-${process.pid}-${Date.now()}-${randomUUID()}.json`);
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await assertStateLockOwned(lock);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

interface StateLock {
  lockDir: string;
  owner: Required<StateLockOwner>;
}

async function acquireStateLock(lockDir: string): Promise<StateLock> {
  const started = Date.now();
  const timeoutMs = 5_000;
  const staleMs = 30_000;
  while (Date.now() - started < timeoutMs) {
    const owner = { pid: process.pid, token: randomUUID(), created_at: new Date().toISOString() };
    try {
      await mkdir(lockDir);
      try {
        await writeFile(join(lockDir, 'owner.json'), JSON.stringify(owner), 'utf8');
      } catch (error) {
        await rm(lockDir, { recursive: true, force: true });
        throw error;
      }
      return { lockDir, owner };
    } catch (error) {
      if (!isNodeErrorWithCode(error, 'EEXIST')) {
        throw error;
      }
      if (await removeStaleStateLock(lockDir, staleMs)) {
        continue;
      }
      await sleep(50);
    }
  }
  throw new Error(`Timed out waiting for run state lock: ${lockDir}`);
}

interface StateLockOwner {
  pid?: unknown;
  token?: unknown;
  created_at?: unknown;
}

async function assertStateLockOwned(lock: StateLock): Promise<void> {
  if (!(await isStateLockOwned(lock))) {
    throw new Error(`Run state lock ownership was lost: ${lock.lockDir}`);
  }
}

async function isStateLockOwned(lock: StateLock): Promise<boolean> {
  const owner = await readStateLockOwner(lock.lockDir);
  return sameStateLockOwner(lock.owner, owner);
}

async function releaseStateLock(lock: StateLock): Promise<void> {
  if (!(await isStateLockOwned(lock))) {
    return;
  }

  const releaseDir = `${lock.lockDir}.release-${process.pid}-${randomUUID()}`;
  try {
    await rename(lock.lockDir, releaseDir);
  } catch {
    return;
  }
  if (sameStateLockOwner(lock.owner, await readStateLockOwner(releaseDir))) {
    await rm(releaseDir, { recursive: true, force: true });
    return;
  }
  await rename(releaseDir, lock.lockDir).catch(() => undefined);
}

async function removeStaleStateLock(lockDir: string, staleMs: number): Promise<boolean> {
  const observed = await readStateLockSnapshot(lockDir);
  if (!observed || !isStateLockStale(observed, staleMs)) {
    return false;
  }

  try {
    const confirmed = await readStateLockSnapshot(lockDir);
    if (!confirmed || !sameStateLockSnapshot(observed, confirmed) || !isStateLockStale(confirmed, staleMs)) {
      return false;
    }

    const quarantineDir = `${lockDir}.stale-${process.pid}-${randomUUID()}`;
    await rename(lockDir, quarantineDir);
    const quarantined = await readStateLockSnapshot(quarantineDir);
    if (!quarantined || !sameStateLockSnapshot(observed, quarantined) || !isStateLockStale(quarantined, staleMs)) {
      await rename(quarantineDir, lockDir).catch(() => undefined);
      return false;
    }

    await rm(quarantineDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

interface StateLockSnapshot {
  owner: StateLockOwner | null;
  mtimeMs: number;
  ino: number;
  dev: number;
}

async function readStateLockSnapshot(lockDir: string): Promise<StateLockSnapshot | null> {
  try {
    const lockStat = await stat(lockDir);
    return {
      owner: await readStateLockOwner(lockDir),
      mtimeMs: lockStat.mtimeMs,
      ino: lockStat.ino,
      dev: lockStat.dev
    };
  } catch {
    return null;
  }
}

async function readStateLockOwner(lockDir: string): Promise<StateLockOwner | null> {
  try {
    return JSON.parse(await readFile(join(lockDir, 'owner.json'), 'utf8')) as StateLockOwner;
  } catch {
    return null;
  }
}

function isStateLockStale(snapshot: StateLockSnapshot, staleMs: number): boolean {
  const ownerCreatedAt = typeof snapshot.owner?.created_at === 'string' ? Date.parse(snapshot.owner.created_at) : NaN;
  const createdAtMs = Number.isFinite(ownerCreatedAt) ? ownerCreatedAt : snapshot.mtimeMs;
  return Date.now() - createdAtMs > staleMs;
}

function sameStateLockSnapshot(left: StateLockSnapshot, right: StateLockSnapshot): boolean {
  return left.dev === right.dev && left.ino === right.ino && sameStateLockOwner(left.owner, right.owner) && (left.owner !== null || left.mtimeMs === right.mtimeMs);
}

function sameStateLockOwner(left: StateLockOwner | null, right: StateLockOwner | null): boolean {
  return left?.pid === right?.pid && left?.token === right?.token && left?.created_at === right?.created_at;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/** Read a persisted run state JSON file. */
export async function readRunState(path: string): Promise<RunState> {
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
