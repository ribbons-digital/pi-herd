#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runDoctor, formatDoctorText } from './doctor.js';
import { nodeCommandRunner } from './command-runner.js';
import { runInit, formatInitText } from './init.js';
import { createRun, formatRunCreateText, parseRole } from './run-state.js';
import { formatStartText, startRun } from './start.js';
import { leadBrief, leadCollect, leadStatus, sendMessage } from './messaging.js';

const HELP = `pi-herd

Usage:
  pi-herd doctor [--json] [--config PATH]
  pi-herd init [--force] [--config PATH]
  pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd start <goal> [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd send <role> <message> [--run RUN] [--config PATH]
  pi-herd lead <status|brief|collect|send> [args] [--run RUN] [--config PATH]
  pi-herd --help

Commands:
  doctor  Check the local environment and pi-herd config.
  init    Create .pi-herd config, run directory, prompts, and ignore entries.
  run     Create and manage orchestration run state.
  start   Create or bind lead, launch visible sessions, and activate planner.
  send    Send a prompt to a selected role pane, activating reviewer/tester if needed.
  lead    Lead-session shortcuts for status, brief, collect, and send.
`;

export async function main(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  try {
    if (argv[0] === '--') {
      argv = argv.slice(1);
    }
    const command = argv[0];
    if (!command || command === '--help' || command === '-h') {
      process.stdout.write(HELP);
      return 0;
    }

    if (command === 'doctor') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          json: { type: 'boolean', default: false },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd doctor [--json] [--config PATH]\n');
        return 0;
      }
      const report = await runDoctor({ cwd, configPath: values.config, runner: nodeCommandRunner });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        process.stdout.write(formatDoctorText(report));
      }
      return report.ok ? 0 : 1;
    }

    if (command === 'init') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          force: { type: 'boolean', default: false },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd init [--force] [--config PATH]\n');
        return 0;
      }
      const result = await runInit({ cwd, configPath: values.config, force: values.force });
      process.stdout.write(formatInitText(result));
      return 0;
    }

    if (command === 'start') {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: {
          role: { type: 'string', multiple: true },
          'base-ref': { type: 'string' },
          'planner-worktree': { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd start <goal> [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]\n');
        return 0;
      }
      const goal = positionals.join(' ').trim();
      const roles = values.role?.map(parseRole);
      const result = await startRun({
        cwd,
        goal,
        configPath: values.config,
        roles,
        baseRef: values['base-ref'],
        plannerWorktree: values['planner-worktree'],
        runner: nodeCommandRunner
      });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(result.state, null, 2)}\n`);
      } else {
        process.stdout.write(formatStartText(result));
      }
      return 0;
    }

    if (command === 'send') {
      const parsed = parseSendArgs(argv.slice(1), 'pi-herd send <role> <message> [--run RUN] [--config PATH]');
      if (parsed.help) {
        process.stdout.write('Usage: pi-herd send <role> <message> [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await sendMessage({ cwd, configPath: parsed.config, run: parsed.run, role: parsed.role, message: parsed.message, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }

    if (command === 'lead') {
      const subcommand = argv[1];
      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        process.stdout.write('Usage: pi-herd lead <status|brief|collect|send> [args] [--run RUN] [--config PATH]\n');
        return 0;
      }
      if (subcommand === 'send') {
        const parsed = parseSendArgs(argv.slice(2), 'pi-herd lead send <role> <message> [--run RUN] [--config PATH]');
        if (parsed.help) {
          process.stdout.write('Usage: pi-herd lead send <role> <message> [--run RUN] [--config PATH]\n');
          return 0;
        }
        const result = await sendMessage({ cwd, configPath: parsed.config, run: parsed.run, role: parsed.role, message: parsed.message, requireLead: true, runner: nodeCommandRunner });
        process.stdout.write(result.text);
        return 0;
      }
      const { values } = parseArgs({
        args: argv.slice(2),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write(`Usage: pi-herd lead ${subcommand} [--run RUN] [--config PATH]\n`);
        return 0;
      }
      const options = { cwd, configPath: values.config, run: values.run, runner: nodeCommandRunner };
      if (subcommand === 'status') {
        process.stdout.write((await leadStatus(options)).text);
        return 0;
      }
      if (subcommand === 'brief') {
        process.stdout.write((await leadBrief(options)).text);
        return 0;
      }
      if (subcommand === 'collect') {
        process.stdout.write((await leadCollect(options)).text);
        return 0;
      }
      process.stderr.write(`Unknown lead command: ${subcommand}\n`);
      return 1;
    }

    if (command === 'run') {
      const subcommand = argv[1];
      if (!subcommand || subcommand === '--help' || subcommand === '-h') {
        process.stdout.write('Usage: pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]\n');
        return 0;
      }
      if (subcommand !== 'create') {
        process.stderr.write(`Unknown run command: ${subcommand}\n`);
        return 1;
      }
      const { values, positionals } = parseArgs({
        args: argv.slice(2),
        options: {
          role: { type: 'string', multiple: true },
          'base-ref': { type: 'string' },
          'with-worktrees': { type: 'boolean', default: false },
          'planner-worktree': { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]\n');
        return 0;
      }
      const goal = positionals.join(' ').trim();
      const roles = values.role?.map(parseRole);
      const withWorktrees = Boolean(values['with-worktrees'] || values['planner-worktree']);
      const result = await createRun({
        cwd,
        goal,
        configPath: values.config,
        roles,
        baseRef: values['base-ref'],
        withWorktrees,
        plannerWorktree: values['planner-worktree'],
        runner: nodeCommandRunner
      });
      if (values.json) {
        process.stdout.write(`${JSON.stringify(result.state, null, 2)}\n`);
      } else {
        process.stdout.write(formatRunCreateText(result));
      }
      return 0;
    }

    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    return 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export interface ParsedSendArgs {
  role: ReturnType<typeof parseRole>;
  message: string;
  run?: string;
  config?: string;
  help: boolean;
}

/** Parse send command args, preserving dash-prefixed prompt text after `--`. */
export function parseSendArgs(args: string[], usage: string): ParsedSendArgs {
  let run: string | undefined;
  let config: string | undefined;
  let role: ReturnType<typeof parseRole> | undefined;
  const messageParts: string[] = [];
  let parsingOptions = true;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (parsingOptions && arg === '--') {
      parsingOptions = false;
      continue;
    }
    if (parsingOptions && (arg === '--help' || arg === '-h')) {
      return { role: 'planner', message: '', help: true };
    }
    if (parsingOptions && (arg === '--run' || arg === '--config')) {
      const value = args[index + 1];
      if (!value) {
        throw new Error(`${arg} requires a value.\nUsage: ${usage}`);
      }
      if (arg === '--run') {
        run = value;
      } else {
        config = value;
      }
      index += 1;
      continue;
    }
    if (!role) {
      if (arg?.startsWith('-')) {
        throw new Error(`Unknown option before role: ${arg}. Use -- before dash-prefixed message text.\nUsage: ${usage}`);
      }
      role = parseRole(arg ?? '');
      continue;
    }
    messageParts.push(arg ?? '');
  }

  if (!role) {
    role = parseRole('');
  }
  const message = messageParts.join(' ').trim();
  if (!message) {
    throw new Error('Message must be a non-empty string.');
  }
  return { role, message, run, config, help: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
