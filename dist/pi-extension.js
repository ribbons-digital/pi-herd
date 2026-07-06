import { createRequire } from 'node:module';const require = createRequire(import.meta.url);

// src/pi-extension.ts
import { existsSync, realpathSync } from "node:fs";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
var DEFAULT_COMMAND_TIMEOUT_MS = 3e4;
var SEND_COMMAND_TIMEOUT_MS = 3e5;
var START_COMMAND_TIMEOUT_MS = 3e5;
var WAIT_CLI_TIMEOUT_MS = 6e4;
var WAIT_CLI_POLL_INTERVAL_MS = 2e3;
var WAIT_COMMAND_TIMEOUT_CUSHION_MS = 3e4;
var NODE_TIMER_MAX_MS = 2147483647;
var WAIT_CLI_TIMEOUT_MAX_MS = NODE_TIMER_MAX_MS - WAIT_COMMAND_TIMEOUT_CUSHION_MS;
var MAX_NOTIFY_CHARS = 12e3;
var MAX_CAPTURE_CHARS = MAX_NOTIFY_CHARS;
var HERD_USAGE = `Usage:
  /herd init
  /herd doctor
  /herd start <goal>
  /herd-start <goal>
  /herd status [--run RUN]
  /herd brief [--run RUN]
  /herd collect [--run RUN]
  /herd diff [--run RUN]
  /herd wait [--timeout-ms MS] [--run RUN]
  /herd send <role> <message> [--run RUN]
  /herd interrupt <role> [--run RUN]

Notes:
  /herd start and /herd-start accept a simple goal. Use terminal pi-herd start for advanced flags.
  /herd diff is read-only and shows diff stat plus changed files.
  /herd wait accepts --timeout-ms MS, uses a fixed 2s poll interval, and records role verdicts in run state.
  /herd collect maps to read-only pi-herd lead collect.
  pi-herd collect remains a terminal command for writing FINAL_SUMMARY.md.
  /herd interrupt sends Escape to a role pane and marks its stored status blocked until it is re-prompted.`;
function piHerdExtension(pi) {
  pi.registerCommand("herd", {
    description: "Lead-session pi-herd shortcuts",
    getArgumentCompletions: (prefix) => {
      const commands = ["init", "doctor", "start", "status", "brief", "collect", "diff", "wait", "send", "interrupt", "help"];
      const filtered = commands.filter((command) => command.startsWith(prefix.trim()));
      return filtered.length > 0 ? filtered.map((command) => ({ value: command, label: command })) : null;
    },
    handler: createHerdCommandHandler()
  });
  pi.registerCommand("herd-start", {
    description: "Start a pi-herd run from a prompt-native slash command",
    handler: createHerdStartAliasHandler()
  });
}
function createHerdCommandHandler(options = {}) {
  return async (args, ctx) => {
    const command = buildHerdCommand(args);
    if (!command) {
      presentOutput(ctx, HERD_USAGE, "info");
      return;
    }
    await runHerdCommand(command, ctx, options);
  };
}
function createHerdStartAliasHandler(options = {}) {
  return async (args, ctx) => {
    await runHerdCommand(buildHerdStartAliasCommand(args), ctx, options);
  };
}
async function runHerdCommand(command, ctx, options) {
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
    presentOutput(ctx, boundOutput(text), "info");
    return;
  }
  if (command.warnExitCodes?.includes(result.exitCode ?? Number.NaN) && result.stdout.trim() && !result.timedOut && !result.error) {
    const warning = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
    presentOutput(ctx, boundOutput(warning), "warning");
    return;
  }
  const failure = formatCommandFailure(command.displayName, result, command.timeoutMs, command.timeoutHint, command.failureHint);
  presentOutput(ctx, failure, "error");
  throw new Error(failure);
}
function buildHerdCommand(args) {
  const leadingTokens = tokenizeWithSpans(args, 1);
  const subcommand = leadingTokens[0]?.value;
  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    return null;
  }
  if (subcommand === "send") {
    return buildHerdSendCommand(args);
  }
  if (subcommand === "start") {
    return buildHerdStartCommand(args, leadingTokens);
  }
  const tokens = tokenizeWithSpans(args);
  if (subcommand === "init" || subcommand === "doctor") {
    rejectUnexpectedArgs(tokens.slice(1), `/herd ${subcommand}`);
    return {
      cliArgs: [subcommand],
      displayName: `/herd ${subcommand}`,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
      warnExitCodes: subcommand === "doctor" ? [1] : void 0
    };
  }
  if (subcommand === "status" || subcommand === "brief" || subcommand === "collect") {
    const run = parseOptionalRun(tokens.slice(1), `/herd ${subcommand} [--run RUN]`);
    return {
      cliArgs: run ? ["lead", subcommand, "--run", run] : ["lead", subcommand],
      displayName: `/herd ${subcommand}`,
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS
    };
  }
  if (subcommand === "diff") {
    const run = parseOptionalRun(tokens.slice(1), "/herd diff [--run RUN]");
    return {
      cliArgs: run ? ["diff", "--run", run] : ["diff"],
      displayName: "/herd diff",
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS
    };
  }
  if (subcommand === "interrupt") {
    const role = tokens[1]?.value;
    if (!role || role.startsWith("-")) {
      throw new Error("Usage: /herd interrupt <role> [--run RUN]");
    }
    const run = parseOptionalRun(tokens.slice(2), "/herd interrupt <role> [--run RUN]");
    return {
      cliArgs: run ? ["interrupt", role, "--run", run] : ["interrupt", role],
      displayName: "/herd interrupt",
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS
    };
  }
  if (subcommand === "wait") {
    const wait = parseWaitOptions(tokens.slice(1));
    const cliArgs = ["wait", "--timeout-ms", String(wait.timeoutMs), "--poll-interval-ms", String(WAIT_CLI_POLL_INTERVAL_MS)];
    if (wait.run) {
      cliArgs.push("--run", wait.run);
    }
    return {
      cliArgs,
      displayName: "/herd wait",
      timeoutMs: wait.timeoutMs + WAIT_COMMAND_TIMEOUT_CUSHION_MS,
      warnExitCodes: [2, 3],
      timeoutHint: "The wait command may still be running. For longer waits, pass --timeout-ms MS to /herd wait.",
      failureHint: "For longer waits, pass --timeout-ms MS to /herd wait."
    };
  }
  throw new Error(`Unknown /herd command: ${subcommand}
${HERD_USAGE}`);
}
function buildHerdStartCommand(args, tokens = tokenizeWithSpans(args, 1)) {
  const startToken = tokens[0];
  return buildStartCommandFromGoal(args.slice(startToken?.end ?? 0), "/herd start", "Usage: /herd start <goal>");
}
function buildHerdStartAliasCommand(args) {
  return buildStartCommandFromGoal(args, "/herd-start", "Usage: /herd-start <goal>");
}
function buildStartCommandFromGoal(rawGoalInput, displayName, usage) {
  const rawGoal = rawGoalInput.trim();
  if (!rawGoal) {
    throw new Error(usage);
  }
  const goal = stripMatchingOuterQuotes(rawGoal);
  if (goal.startsWith("-")) {
    throw new Error(`${usage}
For advanced flags, run terminal command: pi-herd start ...`);
  }
  return {
    cliArgs: ["start", goal],
    displayName,
    timeoutMs: START_COMMAND_TIMEOUT_MS,
    timeoutHint: "The run may have partially started. Check with pi-herd run list, pi-herd status, or clean up with pi-herd cleanup."
  };
}
function buildHerdSendCommand(args, tokens = tokenizeWithSpans(args, 2)) {
  const role = tokens[1]?.value;
  if (!role || role === "--help" || role === "-h") {
    throw new Error(`Usage: /herd send <role> <message> [--run RUN]`);
  }
  const trailingRun = parseTrailingSendRun(args, tokens[1].end);
  const rawMessage = args.slice(tokens[1].end, trailingRun.messageEnd).trim();
  if (!rawMessage) {
    throw new Error("Message must be a non-empty string.");
  }
  const message = stripMatchingOuterQuotes(rawMessage);
  const cliArgs = ["lead", "send", role, message];
  if (trailingRun.run) {
    cliArgs.push("--run", trailingRun.run);
  }
  return { cliArgs, displayName: "/herd send", timeoutMs: SEND_COMMAND_TIMEOUT_MS };
}
function parseTrailingSendRun(args, roleEnd) {
  const end = trimEndIndex(args);
  const messageStart = firstNonWhitespaceIndex(args, roleEnd);
  const quotedMessageEnd = findOuterQuotedMessageEnd(args, messageStart, end);
  if (quotedMessageEnd !== void 0) {
    const afterQuote = args.slice(quotedMessageEnd, end);
    if (!afterQuote.trim()) {
      return { messageEnd: args.length };
    }
    const trailingRun2 = matchTrailingRun(args.slice(quotedMessageEnd, end));
    if (trailingRun2 && trailingRun2.match.index === 0) {
      return { run: trailingRun2.value, messageEnd: quotedMessageEnd };
    }
  }
  const trailingRun = matchTrailingRun(args.slice(0, end));
  if (trailingRun && trailingRun.match.index >= roleEnd) {
    return { run: trailingRun.value, messageEnd: trailingRun.match.index };
  }
  return { messageEnd: args.length };
}
function matchTrailingRun(value) {
  const patterns = [
    { regex: /(?:^|\s)--run\s+"((?:\\.|[^"\\])*)"$/, quoted: true },
    { regex: /(?:^|\s)--run\s+'((?:\\.|[^'\\])*)'$/, quoted: true },
    { regex: /(?:^|\s)--run\s+([^\s'"]\S*)$/, quoted: false }
  ];
  for (const pattern of patterns) {
    const match = pattern.regex.exec(value);
    if (!match) {
      continue;
    }
    const run = pattern.quoted ? unescapeQuotedToken(match[1] ?? "") : match[1] ?? "";
    if (!run) {
      throw new Error(`--run requires a value.
Usage: /herd send <role> <message> [--run RUN]`);
    }
    return { match, value: run };
  }
  return void 0;
}
function firstNonWhitespaceIndex(value, start) {
  let index = start;
  while (index < value.length && /\s/.test(value[index] ?? "")) {
    index += 1;
  }
  return index;
}
function findOuterQuotedMessageEnd(value, start, end) {
  const quote = value[start];
  if (quote !== '"' && quote !== "'") {
    return void 0;
  }
  let index = start + 1;
  while (index < end) {
    const char = value[index] ?? "";
    if (char === "\\" && index + 1 < end) {
      index += 2;
      continue;
    }
    if (char === quote) {
      return index + 1;
    }
    index += 1;
  }
  return void 0;
}
function trimEndIndex(value) {
  let index = value.length;
  while (index > 0 && /\s/.test(value[index - 1] ?? "")) {
    index -= 1;
  }
  return index;
}
function unescapeQuotedToken(value) {
  return value.replace(/\\([\s\S])/g, "$1");
}
function stripMatchingOuterQuotes(value) {
  if (value.length < 2) {
    return value;
  }
  const quote = value[0];
  if (quote !== '"' && quote !== "'" || value[value.length - 1] !== quote) {
    return value;
  }
  return unescapeMatchingMessageQuote(value.slice(1, -1), quote);
}
function unescapeMatchingMessageQuote(value, quote) {
  let result = "";
  let index = 0;
  while (index < value.length) {
    const char = value[index] ?? "";
    const next = value[index + 1];
    if (char === "\\" && next === quote) {
      result += quote;
      index += 2;
      continue;
    }
    result += char;
    index += 1;
  }
  return result;
}
function rejectUnexpectedArgs(tokens, usage) {
  const token = tokens[0]?.value;
  if (!token) {
    return;
  }
  if (token === "--help" || token === "-h") {
    throw new Error(`Usage: ${usage}`);
  }
  throw new Error(`Unknown argument for /herd command: ${token}
Usage: ${usage}`);
}
function parseOptionalRun(tokens, usage, advancedHint) {
  let run;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]?.value;
    if (token === "--run") {
      const value = tokens[index + 1]?.value;
      if (!value) {
        throw new Error(`--run requires a value.
Usage: ${usage}`);
      }
      run = value;
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      throw new Error(`Usage: ${usage}`);
    }
    throw new Error(`Unknown argument for /herd command: ${token}
Usage: ${usage}${advancedHint ? `
${advancedHint}` : ""}`);
  }
  return run;
}
function parseWaitOptions(tokens) {
  const usage = "/herd wait [--timeout-ms MS] [--run RUN]";
  let timeoutMs = WAIT_CLI_TIMEOUT_MS;
  let run;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]?.value;
    if (token === "--timeout-ms") {
      const value = tokens[index + 1]?.value;
      if (!value) {
        throw new Error(`--timeout-ms requires a positive integer value.
Usage: ${usage}`);
      }
      timeoutMs = parsePositiveIntegerFlag(value, "--timeout-ms", usage, WAIT_CLI_TIMEOUT_MAX_MS);
      index += 1;
      continue;
    }
    if (token === "--run") {
      const value = tokens[index + 1]?.value;
      if (!value) {
        throw new Error(`--run requires a value.
Usage: ${usage}`);
      }
      if (index + 2 < tokens.length) {
        throw new Error(`--run must be the trailing /herd wait option.
Usage: ${usage}`);
      }
      run = value;
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      throw new Error(`Usage: ${usage}`);
    }
    throw new Error(`Unsupported /herd wait argument: ${token}
Usage: ${usage}`);
  }
  return { timeoutMs, run };
}
function parsePositiveIntegerFlag(value, name, usage, max = Number.MAX_SAFE_INTEGER) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.
Usage: ${usage}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    throw new Error(`${name} must be a positive integer no larger than ${max}.
Usage: ${usage}`);
  }
  return parsed;
}
function tokenizeWithSpans(input, maxTokens = Number.POSITIVE_INFINITY) {
  const tokens = [];
  let index = 0;
  while (index < input.length && tokens.length < maxTokens) {
    while (index < input.length && /\s/.test(input[index] ?? "")) {
      index += 1;
    }
    if (index >= input.length) {
      break;
    }
    const start = index;
    let value = "";
    let quote;
    while (index < input.length) {
      const char = input[index] ?? "";
      if (quote) {
        if (char === quote) {
          quote = void 0;
          index += 1;
          continue;
        }
        if (char === "\\" && index + 1 < input.length) {
          value += input[index + 1] ?? "";
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
      if (char === "\\" && index + 1 < input.length) {
        value += input[index + 1] ?? "";
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
function resolveHerdCli(options = {}) {
  const env = options.env ?? process.env;
  const override = env.PI_HERD_CLI?.trim();
  if (override) {
    if (override.endsWith(".js")) {
      return { command: process.execPath, argsPrefix: [override], source: "env" };
    }
    return { command: override, argsPrefix: [], source: "env" };
  }
  const siblingCli = siblingCliPath(options.moduleUrl ?? import.meta.url);
  if (siblingCli) {
    return { command: process.execPath, argsPrefix: [siblingCli], source: "sibling-dist" };
  }
  return { command: "pi-herd", argsPrefix: [], source: "path" };
}
function buildHerdCliEnv(env = process.env) {
  const herdrBinPath = env.HERDR_BIN_PATH?.trim();
  if (!herdrBinPath || !isAbsolute(herdrBinPath)) {
    return { ...env };
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey];
  const herdrBinDir = dirname(herdrBinPath);
  return {
    ...env,
    [pathKey]: currentPath ? `${herdrBinDir}${delimiter}${currentPath}` : herdrBinDir
  };
}
function siblingCliPath(moduleUrl) {
  if (!moduleUrl.startsWith("file:")) {
    return void 0;
  }
  try {
    const extensionPath = realpathSync(fileURLToPath(moduleUrl));
    const candidate = join(dirname(extensionPath), "cli.js");
    return existsSync(candidate) ? candidate : void 0;
  } catch {
    return void 0;
  }
}
function boundOutput(text, maxChars = MAX_NOTIFY_CHARS) {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}

[Output truncated to ${maxChars} characters.]`;
}
function formatCommandFailure(displayName, result, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, timeoutHint, failureHint) {
  if (result.timedOut) {
    return `${displayName} timed out after ${timeoutMs}ms.${timeoutHint ? `
${timeoutHint}` : ""}`;
  }
  if (result.error) {
    return `${displayName} failed to start: ${result.error.message}${failureHint ? `
${failureHint}` : ""}`;
  }
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  const detail = [stderr, stdout].filter(Boolean).join("\n");
  return boundOutput(`${displayName} failed with exit code ${result.exitCode ?? "unknown"}.${detail ? `
${detail}` : ""}`);
}
function presentOutput(ctx, message, level) {
  if (ctx.hasUI && ctx.ui?.notify) {
    ctx.ui.notify(message, level);
    return;
  }
  if (ctx.mode === "print") {
    const stream = level === "error" ? process.stderr : process.stdout;
    stream.write(`${message}
`);
  }
}
function appendCapturedOutput(current, chunk) {
  if (current.length >= MAX_CAPTURE_CHARS) {
    return current;
  }
  const next = current + chunk;
  return next.length > MAX_CAPTURE_CHARS ? next.slice(0, MAX_CAPTURE_CHARS) : next;
}
var nodeCommandRunner = {
  run(command, args, options) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        env: options?.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const timeoutMs = options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
      let stdout = "";
      let stderr = "";
      let settled = false;
      let closed = false;
      let killTimer;
      const finish = (result, clearEscalation = true) => {
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
      const safeKill = (signal) => {
        try {
          child.kill(signal);
        } catch {
        }
      };
      const timer = setTimeout(() => {
        safeKill("SIGTERM");
        child.stdout?.destroy();
        child.stderr?.destroy();
        killTimer = setTimeout(() => {
          if (!closed) {
            safeKill("SIGKILL");
          }
        }, 250);
        finish({ exitCode: null, stdout, stderr, timedOut: true }, false);
      }, timeoutMs);
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout = appendCapturedOutput(stdout, String(chunk));
      });
      child.stderr?.on("data", (chunk) => {
        stderr = appendCapturedOutput(stderr, String(chunk));
      });
      child.on("error", (error) => {
        finish({ exitCode: null, stdout, stderr, error });
      });
      child.on("close", (exitCode) => {
        closed = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        finish({ exitCode, stdout, stderr });
      });
    });
  }
};
export {
  HERD_USAGE,
  boundOutput,
  buildHerdCliEnv,
  buildHerdCommand,
  buildHerdSendCommand,
  buildHerdStartAliasCommand,
  buildHerdStartCommand,
  createHerdCommandHandler,
  createHerdStartAliasHandler,
  piHerdExtension as default,
  formatCommandFailure,
  nodeCommandRunner,
  parseOptionalRun,
  presentOutput,
  rejectUnexpectedArgs,
  resolveHerdCli,
  siblingCliPath,
  tokenizeWithSpans
};
