import { delimiter, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as cliMain } from './cli.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';

export const PLUGIN_ACTIONS = ['doctor', 'start', 'status', 'collect', 'cleanup'] as const;
export type PluginAction = typeof PLUGIN_ACTIONS[number];

const RUN_SELECTOR_OPTIONS = new Set(['--run', '--config']);
const CLEANUP_DESTRUCTIVE_OPTIONS = new Set(['--complete', '--abandon', '--close-panes', '--remove-worktrees', '--force']);

export interface PluginRuntimeEnv {
  [key: string]: string | undefined;
}

export interface ResolveTargetCwdOptions {
  env: PluginRuntimeEnv;
  pluginRoot: string;
  runner: CommandRunner;
}

export interface RunPluginActionOptions {
  argv: string[];
  env?: PluginRuntimeEnv;
  pluginRoot?: string;
  runner?: CommandRunner;
  main?: (argv: string[], cwd?: string) => Promise<number>;
}

interface HerdrPluginContext {
  focused_pane_cwd?: unknown;
  workspace_cwd?: unknown;
  cwd?: unknown;
  pane?: {
    cwd?: unknown;
    foreground_cwd?: unknown;
  };
  worktree?: {
    path?: unknown;
    cwd?: unknown;
  };
}

export async function runHerdrPluginAction(options: RunPluginActionOptions): Promise<number> {
  const env = options.env ?? process.env;
  const pluginRoot = resolve(options.pluginRoot ?? env.HERDR_PLUGIN_ROOT ?? process.cwd());
  const runner = options.runner ?? nodeCommandRunner;
  const main = options.main ?? cliMain;
  const action = parsePluginAction(options.argv[0] ?? env.HERDR_PLUGIN_ACTION_ID);
  if (!action) {
    process.stderr.write(`Unknown pi-herd plugin action: ${options.argv[0] ?? env.HERDR_PLUGIN_ACTION_ID ?? '(missing)'}\n`);
    return 1;
  }

  try {
    applyHerdrBinPath(env);
    const cliArgs = buildPluginCliArgs(action, options.argv.slice(1));
    const targetCwd = await resolvePluginTargetCwd({ env, pluginRoot, runner });
    return await main(cliArgs, targetCwd);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function parsePluginAction(value: string | undefined): PluginAction | null {
  if (!value) return null;
  return PLUGIN_ACTIONS.includes(value as PluginAction) ? (value as PluginAction) : null;
}

export function buildPluginCliArgs(action: PluginAction, args: string[]): string[] {
  if (action === 'doctor') {
    if (args.length) throw new Error('Usage: pi-herd plugin doctor');
    return ['doctor'];
  }

  if (action === 'start') {
    if (!args.length) {
      throw new Error('Usage: pi-herd plugin start <goal>. Herdr action invocation does not provide goal text on this Herdr version, so run `pi-herd start <goal>` from the project checkout.');
    }
    if (args.some((arg) => arg.startsWith('-'))) {
      throw new Error('The pi-herd plugin start action only accepts goal text. Run `pi-herd start` directly for flags.');
    }
    return ['start', ...args];
  }

  if (action === 'cleanup') {
    for (const arg of args) {
      if (CLEANUP_DESTRUCTIVE_OPTIONS.has(arg)) {
        throw new Error(`The pi-herd plugin cleanup action is report-only and does not accept ${arg}. Run pi-herd cleanup directly if you need explicit cleanup flags.`);
      }
    }
    return ['cleanup', ...parseRunSelectorArgs(args)];
  }

  return [action, ...parseRunSelectorArgs(args)];
}

function parseRunSelectorArgs(args: string[]): string[] {
  const parsed: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!RUN_SELECTOR_OPTIONS.has(arg)) {
      throw new Error(`Unsupported plugin action argument: ${arg}. Supported selector options are --run and --config.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('-')) {
      throw new Error(`Missing value for ${arg}.`);
    }
    parsed.push(arg, value);
    index += 1;
  }
  return parsed;
}

export async function resolvePluginTargetCwd(options: ResolveTargetCwdOptions): Promise<string> {
  const fromContext = cwdFromPluginContext(options.env.HERDR_PLUGIN_CONTEXT_JSON);
  if (fromContext) return fromContext;

  const fromHerdr = await cwdFromHerdrPane(options);
  if (fromHerdr) return fromHerdr;

  throw new Error('Could not determine a target project directory from Herdr plugin context. Focus a project pane and retry, or run pi-herd directly from the project checkout.');
}

export function cwdFromPluginContext(contextJson: string | undefined): string | null {
  if (!contextJson) return null;
  let context: HerdrPluginContext;
  try {
    context = JSON.parse(contextJson) as HerdrPluginContext;
  } catch {
    return null;
  }
  return firstPath(
    context.focused_pane_cwd,
    context.workspace_cwd,
    // These fallback shapes are accepted for forward compatibility with richer plugin contexts.
    context.pane?.foreground_cwd,
    context.pane?.cwd,
    context.worktree?.path,
    context.worktree?.cwd,
    context.cwd
  );
}

async function cwdFromHerdrPane(options: ResolveTargetCwdOptions): Promise<string | null> {
  const herdr = options.env.HERDR_BIN_PATH || 'herdr';
  const args = ['pane', 'current'];
  if (options.env.HERDR_PANE_ID) {
    args.push('--pane', options.env.HERDR_PANE_ID);
  } else {
    args.push('--current');
  }
  const result = await options.runner.run(herdr, args, { cwd: options.pluginRoot });
  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  try {
    const parsed = JSON.parse(result.stdout) as { result?: { pane?: { foreground_cwd?: unknown; cwd?: unknown } } };
    return firstPath(parsed.result?.pane?.foreground_cwd, parsed.result?.pane?.cwd);
  } catch {
    return null;
  }
}

function firstPath(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    return resolve(trimmed);
  }
  return null;
}

export function applyHerdrBinPath(env: PluginRuntimeEnv): void {
  if (!env.HERDR_BIN_PATH) return;
  const herdrDir = dirname(env.HERDR_BIN_PATH);
  const currentPath = process.env.PATH ?? '';
  const parts = currentPath.split(delimiter).filter(Boolean);
  if (parts.includes(herdrDir)) return;
  process.env.PATH = [herdrDir, currentPath].filter(Boolean).join(delimiter);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHerdrPluginAction({ argv: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
