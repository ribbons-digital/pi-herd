import { createInterface, type Interface } from 'node:readline/promises';
import { stdin as defaultStdin, stdout as defaultStdout } from 'node:process';
import { pathToFileURL } from 'node:url';
import { boardRun } from './board.js';
import { nodeCommandRunner, type CommandRunner } from './command-runner.js';
import { applyHerdrBinPath, resolvePluginTargetCwd, type PluginRuntimeEnv } from './herdr-plugin-action.js';

export const PLUGIN_PANES = ['run-board'] as const;
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
  if (pane !== 'run-board') {
    output.write(`Unsupported pi-herd plugin pane: ${pane}\n`);
    return 1;
  }
  const ok = await renderBoardSafely(options, output);
  if (options.holdOpen === false) return ok ? 0 : 1;
  const autoRefreshIntervalMs = options.autoRefreshIntervalMs ?? 10_000;
  output.write(`\nPress Enter to refresh now. Auto-refreshes every ${formatRefreshInterval(autoRefreshIntervalMs)}. Type q then Enter to quit.\n`);
  const readline = options.createReadline?.() ?? createInterface({ input: defaultStdin, output: defaultStdout });
  let renderChain = Promise.resolve();
  const queueRender = (): Promise<void> => {
    renderChain = renderChain.then(async () => {
      await renderBoardSafely(options, output);
    });
    return renderChain;
  };
  const interval = setInterval(() => {
    void queueRender();
  }, autoRefreshIntervalMs);
  try {
    for (;;) {
      const answer = await readline.question('pi-herd board> ');
      if (answer.trim().toLowerCase() === 'q') break;
      await queueRender();
    }
  } finally {
    clearInterval(interval);
    await renderChain;
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
  const env = options.env ?? process.env;
  const pluginRoot = options.pluginRoot ?? env.HERDR_PLUGIN_ROOT ?? process.cwd();
  const runner = options.runner ?? nodeCommandRunner;
  const targetCwd = await resolvePluginTargetCwd({ env, pluginRoot, runner });
  const run = parsePaneArgs(options.argv.slice(1));
  const result = await boardRun({ cwd: targetCwd, run, runner });
  output.write(result.text);
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
