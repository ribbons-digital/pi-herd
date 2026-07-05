import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { boardRun } from './board.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { applyHerdrBinPath, resolvePluginTargetCwd, type PluginRuntimeEnv } from './herdr-plugin-action.js';
import { sendMessage } from './messaging.js';
import { parseRole } from './run-state.js';
import { formatStartText, startRun } from './start.js';

export const PLUGIN_PANES = ['run-board', 'start-wizard', 'send-message'] as const;
export type PluginPane = typeof PLUGIN_PANES[number];

export interface RunPluginPaneOptions {
  argv: string[];
  env?: PluginRuntimeEnv;
  pluginRoot?: string;
  runner?: CommandRunner;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  holdOpen?: boolean;
  createReadline?: () => Interface;
  autoRefreshIntervalMs?: number;
}

function formatRefreshInterval(ms: number): string {
  return ms > 0 && Number.isInteger(ms) && ms % 1_000 === 0 ? `${ms / 1_000}s` : `${ms}ms`;
}

export async function runHerdrPluginPane(options: RunPluginPaneOptions): Promise<number> {
  const env = options.env ?? process.env;
  const pane = parsePluginPane(options.argv[0] ?? env.HERDR_PLUGIN_ENTRYPOINT_ID);
  const output = options.stdout ?? defaultStdout;
  if (!pane) {
    output.write(`Unknown pi-herd plugin pane: ${options.argv[0] ?? env.HERDR_PLUGIN_ENTRYPOINT_ID ?? '(missing)'}\n`);
    return 1;
  }

  applyHerdrBinPath(env);
  if (pane === 'start-wizard') return runStartWizardSafely(options, output);
  if (pane === 'send-message') return runSendMessageSafely(options, output);
  const ok = await renderBoardSafely(options, output);
  if (options.holdOpen === false) return ok ? 0 : 1;
  const autoRefreshIntervalMs = options.autoRefreshIntervalMs ?? 10_000;
  output.write(`\nPress Enter to refresh now. Auto-refreshes every ${formatRefreshInterval(autoRefreshIntervalMs)}. Type q then Enter to quit.\n`);
  const readline = options.createReadline?.() ?? createInterface({ input: defaultStdin, output: defaultStdout });
  let renderInFlight: Promise<void> | null = null;
  let manualRefreshRequested = false;
  const startRender = (): Promise<void> => (async () => {
    try {
      await renderBoardSafely(options, output);
    } finally {
      if (manualRefreshRequested) {
        manualRefreshRequested = false;
        renderInFlight = startRender();
      } else {
        renderInFlight = null;
      }
    }
  })();
  const queueRender = (manual = false): Promise<void> => {
    if (renderInFlight) {
      if (manual) manualRefreshRequested = true;
      return renderInFlight;
    }
    renderInFlight = startRender();
    return renderInFlight;
  };
  const interval = setInterval(() => {
    if (renderInFlight) return;
    void queueRender();
  }, autoRefreshIntervalMs);
  try {
    for (;;) {
      const answer = await readline.question('pi-herd board> ');
      if (answer.trim().toLowerCase() === 'q') break;
      await queueRender(true);
    }
  } finally {
    clearInterval(interval);
    while (renderInFlight) await renderInFlight;
    readline.close();
  }
  return 0;
}

async function renderBoardSafely(options: RunPluginPaneOptions, output: Pick<NodeJS.WriteStream, 'write'>): Promise<boolean> {
  try {
    await renderBoardOnce(options, output);
    return true;
  } catch (error) {
    output.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return false;
  }
}

export function parsePluginPane(value: string | undefined): PluginPane | null {
  if (!value) return null;
  return PLUGIN_PANES.includes(value as PluginPane) ? (value as PluginPane) : null;
}

async function renderBoardOnce(options: RunPluginPaneOptions, output: Pick<NodeJS.WriteStream, 'write'>): Promise<void> {
  const { runner, targetCwd } = await resolvePaneRuntime(options);
  const run = parsePaneArgs(options.argv.slice(1));
  const result = await boardRun({ cwd: targetCwd, run, runner });
  output.write(result.text);
}

async function runStartWizardSafely(options: RunPluginPaneOptions, output: Pick<NodeJS.WriteStream, 'write'>): Promise<number> {
  const readline = options.createReadline?.() ?? createInterface({ input: defaultStdin, output: defaultStdout });
  try {
    const { env, runner, targetCwd } = await resolvePaneRuntime(options);
    rejectPaneArgs(options.argv.slice(1), 'start-wizard');
    const goal = (await readline.question('Goal: ')).trim();
    if (!goal) throw new Error('Start goal is required.');
    const roles = parseRolesAnswer(await readline.question('Roles (comma-separated, blank for defaults): '));
    const plannerWorktree = parseYesNoAnswer(await readline.question('Planner worktree? (y/N): '), 'Planner worktree');
    const result = await startRun({ cwd: targetCwd, goal, roles, plannerWorktree, runner, env });
    output.write(formatStartText(result));
    return 0;
  } catch (error) {
    output.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    readline.close();
  }
}

async function runSendMessageSafely(options: RunPluginPaneOptions, output: Pick<NodeJS.WriteStream, 'write'>): Promise<number> {
  const readline = options.createReadline?.() ?? createInterface({ input: defaultStdin, output: defaultStdout });
  try {
    const { env, runner, targetCwd } = await resolvePaneRuntime(options);
    rejectPaneArgs(options.argv.slice(1), 'send-message');
    const roleAnswer = (await readline.question('Role: ')).trim();
    if (!roleAnswer) throw new Error('Send role is required.');
    const role = parseRole(roleAnswer);
    const message = (await readline.question('Message: ')).trim();
    if (!message) throw new Error('Send message is required.');
    const runAnswer = (await readline.question('Run selector (blank for latest active): ')).trim();
    const result = await sendMessage({ cwd: targetCwd, role, message, run: runAnswer || undefined, runner, env });
    output.write(result.text);
    return 0;
  } catch (error) {
    output.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    readline.close();
  }
}

async function resolvePaneRuntime(options: RunPluginPaneOptions): Promise<{ env: PluginRuntimeEnv; runner: CommandRunner; targetCwd: string }> {
  const env = options.env ?? process.env;
  const pluginRoot = options.pluginRoot ?? env.HERDR_PLUGIN_ROOT ?? process.cwd();
  const runner = options.runner ?? nodeCommandRunner;
  const targetCwd = await resolvePluginTargetCwd({ env, pluginRoot, runner });
  return { env, runner, targetCwd };
}

function rejectPaneArgs(args: string[], pane: Exclude<PluginPane, 'run-board'>): void {
  if (args.length) throw new Error(`Unsupported plugin pane argument for ${pane}: ${args[0]}.`);
}

function parseRolesAnswer(answer: string) {
  const trimmed = answer.trim();
  if (!trimmed) return undefined;
  const values = trimmed.split(',').map((value) => value.trim());
  if (values.some((value) => !value)) throw new Error('Roles must be comma-separated role names.');
  return values.map(parseRole);
}

function parseYesNoAnswer(answer: string, label: string): boolean {
  const normalized = answer.trim().toLowerCase();
  if (!normalized || normalized === 'n' || normalized === 'no') return false;
  if (normalized === 'y' || normalized === 'yes') return true;
  throw new Error(`${label} must be yes or no.`);
}

function parsePaneArgs(args: string[]): string | undefined {
  let run: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --run.');
      run = value;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      throw new Error('Usage: pi-herd plugin pane run-board [--run RUN]');
    }
    throw new Error(`Unsupported plugin pane argument: ${arg}. Supported options are --run.`);
  }
  return run;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHerdrPluginPane({ argv: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
