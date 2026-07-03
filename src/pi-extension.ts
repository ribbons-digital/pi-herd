import { existsSync, realpathSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export interface PiExtensionApi {
  registerCommand(name: string, options: PiCommandOptions): void;
}

export interface PiCommandOptions {
  description: string;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
  handler(args: string, ctx: PiCommandContext): Promise<void> | void;
}

export interface PiCommandContext {
  cwd: string;
  hasUI?: boolean;
  ui?: {
    notify?(message: string, level?: 'info' | 'warning' | 'error'): void;
  };
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut?: boolean;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }): Promise<CommandResult>;
}

export interface HerdCliResolution {
  command: string;
  argsPrefix: string[];
  source: 'env' | 'sibling-dist' | 'path';
}

export interface HerdCommand {
  cliArgs: string[];
  displayName: string;
  timeoutMs: number;
}

export interface HerdCommandHandlerOptions {
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  moduleUrl?: string;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const SEND_COMMAND_TIMEOUT_MS = 300_000;
const MAX_NOTIFY_CHARS = 12_000;

export const HERD_USAGE = `Usage:
  /herd status [--run RUN]
  /herd brief [--run RUN]
  /herd collect [--run RUN]
  /herd send <role> <message> [--run RUN]

Notes:
  /herd collect maps to read-only pi-herd lead collect.
  pi-herd collect remains a terminal command for writing FINAL_SUMMARY.md.`;

export default function piHerdExtension(pi: PiExtensionApi): void {
  pi.registerCommand('herd', {
    description: 'Lead-session pi-herd shortcuts',
    getArgumentCompletions: (prefix) => {
      const commands = ['status', 'brief', 'collect', 'send', 'help'];
      const filtered = commands.filter((command) => command.startsWith(prefix.trim()));
      return filtered.length > 0 ? filtered.map((command) => ({ value: command, label: command })) : null;
    },
    handler: createHerdCommandHandler()
  });
}

export function createHerdCommandHandler(options: HerdCommandHandlerOptions = {}): PiCommandOptions['handler'] {
  return async (args, ctx) => {
    const command = buildHerdCommand(args);
    if (!command) {
      presentOutput(ctx, HERD_USAGE, 'info');
      return;
    }

    const env = buildHerdCliEnv(options.env ?? process.env);
    const resolution = resolveHerdCli({ env, moduleUrl: options.moduleUrl });
    const runner = options.runner ?? nodeCommandRunner;
    const result = await runner.run(resolution.command, [...resolution.argsPrefix, ...command.cliArgs], {
      cwd: ctx.cwd,
      timeoutMs: command.timeoutMs,
      env
    });

    if (result.exitCode === 0) {
      const text = result.stdout.trim() || `${command.displayName} completed.`;
      presentOutput(ctx, boundOutput(text), 'info');
      return;
    }

    const failure = formatCommandFailure(command.displayName, result, command.timeoutMs);
    presentOutput(ctx, failure, 'error');
    throw new Error(failure);
  };
}

export function buildHerdCommand(args: string): HerdCommand | null {
  const leadingTokens = tokenizeWithSpans(args, 1);
  const subcommand = leadingTokens[0]?.value;
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return null;
  }

  if (subcommand === 'send') {
    return buildHerdSendCommand(args);
  }

  const tokens = tokenizeWithSpans(args);
  if (subcommand === 'status' || subcommand === 'brief' || subcommand === 'collect') {
    const run = parseOptionalRun(tokens.slice(1), `/herd ${subcommand} [--run RUN]`);
    return {
      cliArgs: run ? ['lead', subcommand, '--run', run] : ['lead', subcommand],
      displayName: `/herd ${subcommand}`,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS
    };
  }

  throw new Error(`Unknown /herd command: ${subcommand}\n${HERD_USAGE}`);
}

export function buildHerdSendCommand(args: string, tokens = tokenizeWithSpans(args, 2)): HerdCommand {
  const role = tokens[1]?.value;
  if (!role || role === '--help' || role === '-h') {
    throw new Error(`Usage: /herd send <role> <message> [--run RUN]`);
  }

  const trailingRun = parseTrailingSendRun(args, tokens[1].end);
  const message = args.slice(tokens[1].end, trailingRun.messageEnd).trim();
  if (!message) {
    throw new Error('Message must be a non-empty string.');
  }

  const cliArgs = ['lead', 'send', role, message];
  if (trailingRun.run) {
    cliArgs.push('--run', trailingRun.run);
  }
  return { cliArgs, displayName: '/herd send', timeoutMs: SEND_COMMAND_TIMEOUT_MS };
}

function parseTrailingSendRun(args: string, roleEnd: number): { run?: string; messageEnd: number } {
  const trimmed = args.slice(0, trimEndIndex(args));
  const patterns: Array<{ regex: RegExp; quoted: boolean }> = [
    { regex: /(?:^|\s)--run\s+"((?:\\.|[^"\\])*)"$/, quoted: true },
    { regex: /(?:^|\s)--run\s+'((?:\\.|[^'\\])*)'$/, quoted: true },
    { regex: /(?:^|\s)--run\s+([^\s'"]\S*)$/, quoted: false }
  ];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(trimmed);
    if (!match || match.index < roleEnd) {
      continue;
    }
    const value = pattern.quoted ? unescapeQuotedToken(match[1] ?? '') : match[1] ?? '';
    if (!value) {
      throw new Error(`--run requires a value.\nUsage: /herd send <role> <message> [--run RUN]`);
    }
    return { run: value, messageEnd: match.index };
  }

  return { messageEnd: args.length };
}

function trimEndIndex(value: string): number {
  let index = value.length;
  while (index > 0 && /\s/.test(value[index - 1] ?? '')) {
    index -= 1;
  }
  return index;
}

function unescapeQuotedToken(value: string): string {
  return value.replace(/\\([\s\S])/g, '$1');
}

export function parseOptionalRun(tokens: TokenSpan[], usage: string): string | undefined {
  let run: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]?.value;
    if (token === '--run') {
      const value = tokens[index + 1]?.value;
      if (!value) {
        throw new Error(`--run requires a value.\nUsage: ${usage}`);
      }
      run = value;
      index += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      throw new Error(`Usage: ${usage}`);
    }
    throw new Error(`Unknown argument for /herd command: ${token}\nUsage: ${usage}`);
  }
  return run;
}

export interface TokenSpan {
  value: string;
  start: number;
  end: number;
}

export function tokenizeWithSpans(input: string, maxTokens = Number.POSITIVE_INFINITY): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  let index = 0;

  while (index < input.length && tokens.length < maxTokens) {
    while (index < input.length && /\s/.test(input[index] ?? '')) {
      index += 1;
    }
    if (index >= input.length) {
      break;
    }

    const start = index;
    let value = '';
    let quote: string | undefined;
    while (index < input.length) {
      const char = input[index] ?? '';
      if (quote) {
        if (char === quote) {
          quote = undefined;
          index += 1;
          continue;
        }
        if (char === '\\' && index + 1 < input.length) {
          value += input[index + 1] ?? '';
          index += 2;
          continue;
        }
        value += char;
        index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        index += 1;
        continue;
      }
      if (/\s/.test(char)) {
        break;
      }
      if (char === '\\' && index + 1 < input.length) {
        value += input[index + 1] ?? '';
        index += 2;
        continue;
      }
      value += char;
      index += 1;
    }

    if (quote) {
      throw new Error(`Unterminated quote in /herd arguments.`);
    }
    tokens.push({ value, start, end: index });
  }

  return tokens;
}

export function resolveHerdCli(options: { env?: NodeJS.ProcessEnv; moduleUrl?: string } = {}): HerdCliResolution {
  const env = options.env ?? process.env;
  const override = env.PI_HERD_CLI?.trim();
  if (override) {
    if (override.endsWith('.js')) {
      return { command: process.execPath, argsPrefix: [override], source: 'env' };
    }
    return { command: override, argsPrefix: [], source: 'env' };
  }

  const siblingCli = siblingCliPath(options.moduleUrl ?? import.meta.url);
  if (siblingCli) {
    return { command: process.execPath, argsPrefix: [siblingCli], source: 'sibling-dist' };
  }

  return { command: 'pi-herd', argsPrefix: [], source: 'path' };
}

export function buildHerdCliEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const herdrBinPath = env.HERDR_BIN_PATH?.trim();
  if (!herdrBinPath || !isAbsolute(herdrBinPath)) {
    return { ...env };
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const currentPath = env[pathKey];
  const herdrBinDir = dirname(herdrBinPath);
  return {
    ...env,
    [pathKey]: currentPath ? `${herdrBinDir}${delimiter}${currentPath}` : herdrBinDir
  };
}

export function siblingCliPath(moduleUrl: string): string | undefined {
  if (!moduleUrl.startsWith('file:')) {
    return undefined;
  }
  try {
    const extensionPath = realpathSync(fileURLToPath(moduleUrl));
    const candidate = join(dirname(extensionPath), 'cli.js');
    return existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function boundOutput(text: string, maxChars = MAX_NOTIFY_CHARS): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n[Output truncated to ${maxChars} characters.]`;
}

export function formatCommandFailure(displayName: string, result: CommandResult, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS): string {
  if (result.timedOut) {
    return `${displayName} timed out after ${timeoutMs}ms.`;
  }
  if (result.error) {
    return `${displayName} failed to start: ${result.error.message}`;
  }
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  const detail = [stderr, stdout].filter(Boolean).join('\n');
  return boundOutput(`${displayName} failed with exit code ${result.exitCode ?? 'unknown'}.${detail ? `\n${detail}` : ''}`);
}

export function presentOutput(ctx: PiCommandContext, message: string, level: 'info' | 'warning' | 'error'): void {
  if (ctx.hasUI && ctx.ui?.notify) {
    ctx.ui.notify(message, level);
    return;
  }
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${message}\n`);
}

export const nodeCommandRunner: CommandRunner = {
  run(command, args, options) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const timeoutMs = options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
      let stdout = '';
      let stderr = '';
      let settled = false;
      let closed = false;
      let killTimer: NodeJS.Timeout | undefined;
      const finish = (result: CommandResult, clearEscalation = true) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (clearEscalation && killTimer) {
          clearTimeout(killTimer);
        }
        resolve(result);
      };
      const safeKill = (signal: NodeJS.Signals) => {
        try {
          child.kill(signal);
        } catch {
          // The process may already have exited between timeout and escalation.
        }
      };
      const timer = setTimeout(() => {
        safeKill('SIGTERM');
        child.stdout?.destroy();
        child.stderr?.destroy();
        killTimer = setTimeout(() => {
          if (!closed) {
            safeKill('SIGKILL');
          }
        }, 250);
        finish({ exitCode: null, stdout, stderr, timedOut: true }, false);
      }, timeoutMs);
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        finish({ exitCode: null, stdout, stderr, error });
      });
      child.on('close', (exitCode) => {
        closed = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        finish({ exitCode, stdout, stderr });
      });
    });
  }
};
