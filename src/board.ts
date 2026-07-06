import { join } from 'node:path';
import { listRunsForInvocation, type ActiveRunSummary, type RoleRecord, type RunState } from './run-state.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { BUILT_IN_ROLE_ORDER, type RoleName } from './defaults.js';
import { statusRun, type RoleSnapshot, type RunSnapshot } from './status.js';

export interface BoardCommandOptions {
  cwd: string;
  configPath?: string;
  run?: string;
  runner?: CommandRunner;
  now?: Date;
}

export interface BoardCommandResult {
  text: string;
  exitCode: number;
}

const LEGACY_ROLE_ORDER: RoleName[] = [...BUILT_IN_ROLE_ORDER];
const MAX_BOARD_LINES = 180;
const MAX_WARNINGS = 12;

export async function boardRun(options: BoardCommandOptions): Promise<BoardCommandResult> {
  const runner = options.runner ?? nodeCommandRunner;
  try {
    const status = await statusRun({ cwd: options.cwd, configPath: options.configPath, run: options.run, runner, now: options.now });
    return { text: formatBoard(status.state, status.snapshot), exitCode: 0 };
  } catch (error) {
    if (options.run || !isUnresolvedImplicitRunError(error)) {
      throw error;
    }
    const activeRuns = await listRunsForInvocation(options.cwd, options.configPath, runner, false);
    if (activeRuns.length === 0) {
      return { text: formatNoActiveBoard(), exitCode: 0 };
    }
    return { text: formatMultipleRunsBoard(activeRuns), exitCode: 0 };
  }
}

function isUnresolvedImplicitRunError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith('No active runs found.') || message.startsWith('Multiple active runs found.') || message.startsWith('Current pane matches multiple active runs.');
}

export function formatNoActiveBoard(): string {
  return [
    '# pi-herd run board',
    '',
    'No active pi-herd run was found for this project.',
    '',
    'Next actions:',
    '- Start a run: pi-herd start <goal>',
    '- List old runs: pi-herd run list --all'
  ].join('\n') + '\n';
}

export function formatMultipleRunsBoard(runs: ActiveRunSummary[]): string {
  return [
    '# pi-herd run board',
    '',
    'Multiple active pi-herd runs were found. Open a specific board with --run:',
    ...runs.map((run) => `- ${run.run_id} (${run.run_slug}) ${run.goal}`),
    '',
    'Next actions:',
    '- pi-herd board --run <run_id|slug>',
    '- pi-herd status --run <run_id|slug>'
  ].join('\n') + '\n';
}

export function formatBoard(state: RunState, snapshot: RunSnapshot): string {
  const lines: string[] = [
    '# pi-herd run board',
    '',
    `Run: ${state.run_id} (${state.run_slug})`,
    `Status: ${snapshot.status}`,
    `Goal: ${snapshot.goal}`,
    `Generated: ${snapshot.generated_at}`,
    `Run dir: ${state.canonical_run_dir}`,
    '',
    '## Lead',
    `Pane: ${state.lead_binding.herdr_pane_id ?? 'none'}`,
    `Session: ${state.lead_binding.session_ref ?? 'none'}`,
    `Workspace: ${state.lead_binding.herdr_workspace_id ?? 'none'}`,
    '',
    '## Roles'
  ];

  for (const role of orderedRoles(state)) {
    const record = state.roles[role];
    const roleSnapshot = snapshot.roles.find((candidate) => candidate.role === role);
    lines.push(...formatRole(role, record, roleSnapshot));
  }

  const warnings = snapshot.warnings.slice(0, MAX_WARNINGS);
  lines.push('', '## Warnings');
  if (warnings.length) {
    lines.push(...warnings.map((warning) => `- ${warning}`));
    if (snapshot.warnings.length > warnings.length) {
      lines.push(`- ... ${snapshot.warnings.length - warnings.length} more warnings omitted`);
    }
  } else {
    lines.push('- none');
  }

  lines.push('', '## Durable artifacts', ...formatArtifactPaths(state, snapshot));
  lines.push('', '## Next actions', ...nextBoardActions(state, snapshot).map((action) => `- ${action}`));

  return boundedBoard(lines);
}

function formatRole(role: RoleName, record: RoleRecord | undefined, snapshot: RoleSnapshot | undefined): string[] {
  if (!record) {
    return [`- ${role}: not selected`];
  }
  const stored = snapshot?.stored_status ?? record.status;
  const evaluated = snapshot?.evaluated_status ?? record.status;
  const signal = snapshot?.signal ?? 'unknown';
  const lines = [
    `- ${role}: stored=${stored}; evaluated=${evaluated}; signal=${signal}; pane=${record.herdr_pane_id ?? 'none'}; session=${record.session_ref ?? 'none'}; worktree=${record.worktree_status}`
  ];
  const artifacts = snapshot?.artifacts ?? [];
  if (artifacts.length) {
    for (const artifact of artifacts) {
      const status = artifact.valid ? 'valid' : artifact.present ? artifact.stale ? 'stale' : 'invalid' : 'missing';
      lines.push(`  - artifact ${artifact.name}: ${status}; ${artifact.path}`);
    }
  } else {
    for (const artifact of record.required_artifacts) {
      lines.push(`  - artifact ${artifact}: expected`);
    }
  }
  if (record.worktree_path) {
    lines.push(`  - worktree path: ${record.worktree_path}`);
  }
  return lines;
}

function formatArtifactPaths(state: RunState, snapshot: RunSnapshot): string[] {
  const paths = new Set<string>();
  for (const role of orderedRoles(state)) {
    const record = state.roles[role];
    const roleSnapshot = snapshot.roles.find((candidate) => candidate.role === role);
    for (const artifact of roleSnapshot?.artifacts ?? []) {
      paths.add(artifact.path);
    }
    if (record && !roleSnapshot?.artifacts.length) {
      for (const name of record.required_artifacts) {
        paths.add(join(state.canonical_run_dir, name));
      }
    }
    if (record?.worktree_path) paths.add(record.worktree_path);
  }
  if (snapshot.final_summary_path) paths.add(snapshot.final_summary_path);
  return paths.size ? Array.from(paths).map((path) => `- ${path}`) : ['- none'];
}

function orderedRoles(state: RunState): RoleName[] {
  const ordered = state.role_order?.length ? state.role_order : LEGACY_ROLE_ORDER;
  const roles = [...ordered];
  for (const role of Object.keys(state.roles)) {
    if (!roles.includes(role)) {
      roles.push(role);
    }
  }
  return roles;
}

export function nextBoardActions(state: RunState, snapshot: RunSnapshot): string[] {
  const runSelector = state.run_id;
  const actions: string[] = [];
  const roles = snapshot.roles;
  const hasWaitingRole = roles.some((role) => role.stored_status === 'working' || role.stored_status === 'blocked' || role.evaluated_status === 'working' || role.evaluated_status === 'blocked');
  const hasResolvedRole = roles.some((role) => role.evaluated_status === 'done' || role.evaluated_status === 'incomplete' || role.evaluated_status === 'blocked');
  const incompleteRoles = roles.filter((role) => role.evaluated_status === 'incomplete' || role.evaluated_status === 'blocked');
  const implementer = state.roles.implementer;

  actions.push(`Inspect current state: pi-herd status --run ${runSelector}`);
  if (hasWaitingRole) {
    actions.push(`Wait for working roles: pi-herd wait --run ${runSelector}`);
  }
  for (const role of incompleteRoles) {
    actions.push(`Re-prompt ${role.role}: pi-herd send ${role.role} "<message>" --run ${runSelector}`);
  }
  if (implementer?.worktree_status === 'materialized') {
    actions.push(`Review implementation changes: pi-herd diff --run ${runSelector}`);
  }
  if (hasResolvedRole && !hasWaitingRole) {
    actions.push(`Collect verdicts and write FINAL_SUMMARY.md: pi-herd collect --run ${runSelector}`);
  }
  if (state.status !== 'active') {
    actions.push(`Report cleanup candidates: pi-herd cleanup --run ${runSelector}`);
  }
  return actions;
}

function boundedBoard(lines: string[]): string {
  if (lines.length <= MAX_BOARD_LINES) {
    return `${lines.join('\n')}\n`;
  }
  const head = lines.slice(0, MAX_BOARD_LINES - 2);
  head.push('', `[Board truncated to ${MAX_BOARD_LINES} lines. Run pi-herd status --run <run> for full detail.]`);
  return `${head.join('\n')}\n`;
}
