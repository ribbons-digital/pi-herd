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
  mode?: 'tui' | 'rpc' | 'json' | 'print';
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
  /** Present exit code 1 with stdout as a warning, used for diagnostic reports. */
  warnOnExitOneWithStdout?: boolean;
  /** Extra recovery guidance shown when a long-running command times out. */
  timeoutHint?: string;
}

export interface HerdCommandHandlerOptions {
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  moduleUrl?: string;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const SEND_COMMAND_TIMEOUT_MS = 300_000;
const START_COMMAND_TIMEOUT_MS = 300_000;
const MAX_NOTIFY_CHARS = 12_000;
const MAX_CAPTURE_CHARS = MAX_NOTIFY_CHARS;

export const HERD_USAGE = `Usage:
  /herd init
  /herd doctor
  /herd start <goal>
  /herd status [--run RUN]
  /herd brief [--run RUN]
  /herd collect [--run RUN]
  /herd send <role> <message> [--run RUN]

Notes:
  /herd start accepts a simple goal. Use terminal pi-herd start for advanced flags.
  /herd collect maps to read-only pi-herd lead collect.
  pi-herd collect remains a terminal command for writing FINAL_SUMMARY.md.`;

export default function piHerdExtension(pi: PiExtensionApi): void {
  pi.registerCommand('herd', {
    description: 'Lead-session pi-herd shortcuts',
    getArgumentCompletions: (prefix) => {
      const commands = ['init', 'doctor', 'start', 'status', 'brief', 'collect', 'send', 'help'];
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

    if (command.warnOnExitOneWithStdout && result.exitCode === 1 && result.stdout.trim() && !result.timedOut && !result.error) {
      presentOutput(ctx, boundOutput(result.stdout.trim()), 'warning');
      return;
    }

    const failure = formatCommandFailure(command.displayName, result, command.timeoutMs, command.timeoutHint);
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
  if (subcommand === 'start') {
    return buildHerdStartCommand(args, leadingTokens);
  }

  const tokens = tokenizeWithSpans(args);
  if (subcommand === 'init' || subcommand === 'doctor') {
    rejectUnexpectedArgs(tokens.slice(1), `/herd ${subcommand}`);
    return {
      cliArgs: [subcommand],
      displayName: `/herd ${subcommand}`,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      warnOnExitOneWithStdout: subcommand === 'doctor'
    };
  }

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

export function buildHerdStartCommand(args: string, tokens = tokenizeWithSpans(args, 1)): HerdCommand {
  const startToken = tokens[0];
  const rawGoal = args.slice(startToken?.end ?? 0).trim();
  if (!rawGoal) {
    throw new Error(`Usage: /herd start <goal>`);
  }
  const goal = stripMatchingOuterQuotes(rawGoal);
  if (goal.startsWith('-')) {
    throw new Error(`Usage: /herd start <goal>\nFor advanced flags, run terminal command: pi-herd start ...`);
  }
  return {
    cliArgs: ['start', goal],
    displayName: '/herd start',
    timeoutMs: START_COMMAND_TIMEOUT_MS,
    timeoutHint: 'The run may have partially started. Check with pi-herd run list, pi-herd status, or clean up with pi-herd cleanup.'
  };
}

export function buildHerdSendCommand(args: string, tokens = tokenizeWithSpans(args, 2)): HerdCommand {
  const role = tokens[1]?.value;
  if (!role || role === '--help' || role === '-h') {
    throw new Error(`Usage: /herd send <role> <message> [--run RUN]`);
  }

  const trailingRun = parseTrailingSendRun(args, tokens[1].end);
  const rawMessage = args.slice(tokens[1].end, trailingRun.messageEnd).trim();
  if (!rawMessage) {
    throw new Error('Message must be a non-empty string.');
  }
  const message = stripMatchingOuterQuotes(rawMessage);

  const cliArgs = ['lead', 'send', role, message];
  if (trailingRun.run) {
    cliArgs.push('--run', trailingRun.run);
  }
  return { cliArgs, displayName: '/herd send', timeoutMs: SEND_COMMAND_TIMEOUT_MS };
}

function parseTrailingSendRun(args: string, roleEnd: number): { run?: string; messageEnd: number } {
  const end = trimEndIndex(args);
  const messageStart = firstNonWhitespaceIndex(args, roleEnd);
  const quotedMessageEnd = findOuterQuotedMessageEnd(args, messageStart, end);
  if (quotedMessageEnd !== undefined) {
    const afterQuote = args.slice(quotedMessageEnd, end);
    if (!afterQuote.trim()) {
      return { messageEnd: args.length };
    }
    const trailingRun = matchTrailingRun(args.slice(quotedMessageEnd, end));
    if (trailingRun && trailingRun.match.index === 0) {
      return { run: trailingRun.value, messageEnd: quotedMessageEnd };
    }
  }

  const trailingRun = matchTrailingRun(args.slice(0, end));
  if (trailingRun && trailingRun.match.index >= roleEnd) {
    return { run: trailingRun.value, messageEnd: trailingRun.match.index };
  }

  return { messageEnd: args.length };
}

function matchTrailingRun(value: string): { match: RegExpExecArray; value: string } | undefined {
  const patterns: Array<{ regex: RegExp; quoted: boolean }> = [
    { regex: /(?:^|\s)--run\s+"((?:\\.|[^"\\])*)"$/, quoted: true },
    { regex: /(?:^|\s)--run\s+'((?:\\.|[^'\\])*)'$/, quoted: true },
    { regex: /(?:^|\s)--run\s+([^\s'"]\S*)$/, quoted: false }
  ];

  for (const pattern of patterns) {
    const match = pattern.regex.exec(value);
    if (!match) {
      continue;
    }
    const run = pattern.quoted ? unescapeQuotedToken(match[1] ?? '') : match[1] ?? '';
    if (!run) {
      throw new Error(`--run requires a value.\nUsage: /herd send <role> <message> [--run RUN]`);
    }
    return { match, value: run };
  }
  return undefined;
}

function firstNonWhitespaceIndex(value: string, start: number): number {
  let index = start;
  while (index < value.length && /\s/.test(value[index] ?? '')) {
    index += 1;
  }
  return index;
}

function findOuterQuotedMessageEnd(value: string, start: number, end: number): number | undefined {
  const quote = value[start];
  if (quote !== '"' && quote !== "'") {
    return undefined;
  }
  let index = start + 1;
  while (index < end) {
    const char = value[index] ?? '';
    if (char === '\\' && index + 1 < end) {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return undefined;
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

function stripMatchingOuterQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) {
    return value;
  }
  return unescapeMatchingMessageQuote(value.slice(1, -1), quote);
}

function unescapeMatchingMessageQuote(value: string, quote: string): string {
  let result = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index] ?? '';
    const next = value[index + 1];
    if (char === '\\' && next === quote) {
      result += quote;
      index += 2;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}

export function rejectUnexpectedArgs(tokens: TokenSpan[], usage: string): void {
  const token = tokens[0]?.value;
  if (!token) {
    return;
  }
  if (token === '--help' || token === '-h') {
    throw new Error(`Usage: ${usage}`);
  }
  throw new Error(`Unknown argument for /herd command: ${token}\nUsage: ${usage}`);
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

export function formatCommandFailure(displayName: string, result: CommandResult, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, timeoutHint?: string): string {
  if (result.timedOut) {
    return `${displayName} timed out after ${timeoutMs}ms.${timeoutHint ? `\n${timeoutHint}` : ''}`;
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
  if (ctx.mode === 'print') {
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`${message}\n`);
  }
}

function appendCapturedOutput(current: string, chunk: string): string {
  if (current.length >= MAX_CAPTURE_CHARS) {
    return current;
  }
  const next = current + chunk;
  return next.length > MAX_CAPTURE_CHARS ? next.slice(0, MAX_CAPTURE_CHARS) : next;
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
        stdout = appendCapturedOutput(stdout, String(chunk));
      });
      child.stderr?.on('data', (chunk) => {
        stderr = appendCapturedOutput(stderr, String(chunk));
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
