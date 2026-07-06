import { basename, delimiter, dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as cliMain } from './cli.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';

export const PLUGIN_ACTIONS = ['doctor', 'start', 'status', 'collect', 'cleanup'] as const;
export type PluginAction = typeof PLUGIN_ACTIONS[number];
type PluginEntrypointAction = PluginAction | 'start-help';

const RUN_SELECTOR_OPTIONS = new Set(['--run', '--config']);
const DOCTOR_VALUE_OPTIONS = new Set(['--config']);
const DOCTOR_BOOLEAN_OPTIONS = new Set(['--json']);
const CLEANUP_DESTRUCTIVE_OPTIONS = new Set(['--complete', '--abandon', '--close-panes', '--remove-worktrees', '--force']);
const PANE_LOOKUP_TIMEOUT_MS = 5_000;

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
  focused_pane_id?: unknown;
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
  const action = parsePluginEntrypointAction(options.argv[0] ?? env.HERDR_PLUGIN_ACTION_ID);
  if (!action) {
    process.stderr.write(`Unknown pi-herd plugin action: ${options.argv[0] ?? env.HERDR_PLUGIN_ACTION_ID ?? '(missing)'}\n`);
    return 1;
  }

  try {
    applyHerdrBinPath(env);
    if (action === 'start-help') {
      process.stdout.write(startUsageText());
      return 0;
    }
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

function parsePluginEntrypointAction(value: string | undefined): PluginEntrypointAction | null {
  if (value === 'start-help') return value;
  return parsePluginAction(value);
}

export function buildPluginCliArgs(action: PluginAction, args: string[]): string[] {
  if (action === 'doctor') {
    return ['doctor', ...parseDoctorArgs(args)];
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

  if (action === 'collect') {
    return ['lead', 'collect', ...parseRunSelectorArgs(args)];
  }

  return [action, ...parseRunSelectorArgs(args)];
}

function parseRunSelectorArgs(args: string[]): string[] {
  return parseSupportedArgs(args, RUN_SELECTOR_OPTIONS, new Set(), '--run and --config');
}

function parseDoctorArgs(args: string[]): string[] {
  return parseSupportedArgs(args, DOCTOR_VALUE_OPTIONS, DOCTOR_BOOLEAN_OPTIONS, '--config and --json');
}

function parseSupportedArgs(args: string[], valueOptions: Set<string>, booleanOptions: Set<string>, supportedDescription: string): string[] {
  const parsed: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (booleanOptions.has(arg)) {
      parsed.push(arg);
      continue;
    }
    if (!valueOptions.has(arg)) {
      throw new Error(`Unsupported plugin action argument: ${arg}. Supported options are ${supportedDescription}.`);
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
  const fromContext = cwdFromPluginContext(options.env.HERDR_PLUGIN_CONTEXT_JSON, options.pluginRoot);
  if (fromContext) return fromContext;

  const fromHerdr = await cwdFromHerdrPane(options, paneIdFromPluginContext(options.env.HERDR_PLUGIN_CONTEXT_JSON));
  if (fromHerdr) return fromHerdr;

  throw new Error('Could not determine a target project directory from Herdr plugin context. Focus a project pane and retry, or run pi-herd directly from the project checkout.');
}

export function cwdFromPluginContext(contextJson: string | undefined, basePath = process.cwd()): string | null {
  if (!contextJson) return null;
  let context: HerdrPluginContext;
  try {
    context = JSON.parse(contextJson) as HerdrPluginContext;
  } catch {
    return null;
  }
  return firstPath(
    basePath,
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

async function cwdFromHerdrPane(options: ResolveTargetCwdOptions, contextPaneId: string | null): Promise<string | null> {
  const paneId = stringValue(options.env.HERDR_PANE_ID) ?? contextPaneId;
  if (!paneId) return null;
  const herdr = options.env.HERDR_BIN_PATH || 'herdr';
  const result = await options.runner.run(herdr, ['pane', 'current', '--pane', paneId], { cwd: options.pluginRoot, timeoutMs: PANE_LOOKUP_TIMEOUT_MS });
  if (result.exitCode !== 0 || !result.stdout.trim()) return null;
  try {
    const parsed = JSON.parse(result.stdout) as { result?: { pane?: { foreground_cwd?: unknown; cwd?: unknown } } };
    return firstPath(options.pluginRoot, parsed.result?.pane?.foreground_cwd, parsed.result?.pane?.cwd);
  } catch {
    return null;
  }
}

function paneIdFromPluginContext(contextJson: string | undefined): string | null {
  if (!contextJson) return null;
  try {
    const context = JSON.parse(contextJson) as HerdrPluginContext;
    return stringValue(context.focused_pane_id);
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function firstPath(basePath: string, ...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    return isAbsolute(trimmed) ? trimmed : resolve(basePath, trimmed);
  }
  return null;
}

export function applyHerdrBinPath(env: PluginRuntimeEnv): void {
  if (!env.HERDR_BIN_PATH || !isAbsolute(env.HERDR_BIN_PATH)) return;
  const herdrDir = dirname(env.HERDR_BIN_PATH);
  const currentPath = process.env.PATH ?? '';
  const parts = currentPath.split(delimiter).filter(Boolean);
  if (parts.includes(herdrDir)) return;
  process.env.PATH = [herdrDir, currentPath].filter(Boolean).join(delimiter);
}

function startUsageText(): string {
  return 'Herdr 0.7.1 plugin actions do not pass goal text to actions. Run `pi-herd start <goal>` from the project checkout.\n';
}

function isDirectPluginActionEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && ['herdr-plugin-action.ts', 'herdr-plugin-action.js'].includes(basename(entrypoint)) && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectPluginActionEntrypoint()) {
  runHerdrPluginAction({ argv: process.argv.slice(2) }).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
