#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runDoctor, formatDoctorText } from './doctor.js';
import { nodeCommandRunner } from './command-runner.js';
import { runInit, formatInitText } from './init.js';
import { createRun, formatRunCreateText, listRunsForInvocation, parseRole, type ActiveRunSummary } from './run-state.js';
import { formatStartText, startRun } from './start.js';
import { interruptRole, leadBrief, leadCollect, leadStatus, sendMessage } from './messaging.js';
import { boardRun } from './board.js';
import { collectRun, statusRun, waitRun } from './status.js';
import { diffRun, refreshRole } from './refresh.js';
import { cleanupRun, mergePlanRun } from './cleanup.js';

const HELP = `pi-herd

Usage:
  pi-herd doctor [--json] [--config PATH]
  pi-herd init [--force] [--config PATH]
  pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd run list [--all] [--json] [--config PATH]
  pi-herd start <goal> [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd send <role> <message> [--run RUN] [--config PATH]
  pi-herd interrupt <role> [--run RUN] [--config PATH]
  pi-herd status [--json] [--run RUN] [--config PATH]
  pi-herd board [--run RUN] [--config PATH]
  pi-herd wait [--timeout-ms MS] [--poll-interval-ms MS] [--json] [--run RUN] [--config PATH]
  pi-herd collect [--json] [--run RUN] [--config PATH]
  pi-herd refresh <reviewer|tester> [--force] [--run RUN] [--config PATH]
  pi-herd diff [--run RUN] [--config PATH]
  pi-herd merge-plan [--json] [--run RUN] [--config PATH]
  pi-herd cleanup [--complete|--abandon] [--close-panes] [--remove-worktrees] [--force] [--json] [--run RUN] [--config PATH]
  pi-herd lead <status|brief|collect|send> [args] [--run RUN] [--config PATH]
  pi-herd --help

Commands:
  doctor     Check the local environment and pi-herd config.
  init       Create .pi-herd config, run directory, prompts, and ignore entries.
  run        Create and manage orchestration run state.
  start      Create or bind lead, launch visible sessions, and activate planner.
  send       Send a prompt to a selected role pane, activating reviewer/tester if needed.
  interrupt  Send Escape to a role pane to stop its current work.
  status     Evaluate role activity and required artifacts without writing state.
  board      Show a read-only run board optimized for a Herdr pane.
  wait       Wait for working roles to resolve and persist role verdicts.
  collect    Persist verdicts, collect pane logs, and write FINAL_SUMMARY.md.
  refresh    Refresh reviewer/tester worktrees from the implementation branch.
  diff       Show implementation branch changes against the run base ref.
  merge-plan Write MERGE_DECISION.md with manual merge context.
  cleanup    Report or apply safe run cleanup actions.
  lead       Lead-session shortcuts for status, brief, collect, and send.
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

    if (command === 'interrupt') {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd interrupt <role> [--run RUN] [--config PATH]\n');
        return 0;
      }
      if (positionals.length !== 1) {
        throw new Error('Usage: pi-herd interrupt <role> [--run RUN] [--config PATH]');
      }
      const result = await interruptRole({ cwd, configPath: values.config, run: values.run, role: parseRole(positionals[0]), runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }

    if (command === 'status') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          json: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd status [--json] [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await statusRun({ cwd, configPath: values.config, run: values.run, json: values.json, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }

    if (command === 'board') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd board [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await boardRun({ cwd, configPath: values.config, run: values.run, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }

    if (command === 'wait') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          json: { type: 'boolean', default: false },
          'timeout-ms': { type: 'string' },
          'poll-interval-ms': { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd wait [--timeout-ms MS] [--poll-interval-ms MS] [--json] [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await waitRun({
        cwd,
        configPath: values.config,
        run: values.run,
        json: values.json,
        timeoutMs: values['timeout-ms'] ? Number(values['timeout-ms']) : undefined,
        pollIntervalMs: values['poll-interval-ms'] ? Number(values['poll-interval-ms']) : undefined,
        runner: nodeCommandRunner
      });
      process.stdout.write(result.text);
      return result.exitCode;
    }

    if (command === 'collect') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          json: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd collect [--json] [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await collectRun({ cwd, configPath: values.config, run: values.run, json: values.json, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }

    if (command === 'refresh') {
      const { values, positionals } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          force: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: true
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd refresh <reviewer|tester> [--force] [--run RUN] [--config PATH]\n');
        return 0;
      }
      if (positionals.length !== 1) {
        throw new Error('Usage: pi-herd refresh <reviewer|tester> [--force] [--run RUN] [--config PATH]');
      }
      const result = await refreshRole({ cwd, configPath: values.config, run: values.run, role: parseRole(positionals[0]), force: values.force, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }

    if (command === 'diff') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd diff [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await diffRun({ cwd, configPath: values.config, run: values.run, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return 0;
    }

    if (command === 'merge-plan') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          json: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd merge-plan [--json] [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await mergePlanRun({ cwd, configPath: values.config, run: values.run, json: values.json, runner: nodeCommandRunner });
      process.stdout.write(result.text);
      return result.exitCode;
    }

    if (command === 'cleanup') {
      const { values } = parseArgs({
        args: argv.slice(1),
        options: {
          run: { type: 'string' },
          config: { type: 'string' },
          complete: { type: 'boolean', default: false },
          abandon: { type: 'boolean', default: false },
          'close-panes': { type: 'boolean', default: false },
          'remove-worktrees': { type: 'boolean', default: false },
          force: { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false }
        },
        allowPositionals: false
      });
      if (values.help) {
        process.stdout.write('Usage: pi-herd cleanup [--complete|--abandon] [--close-panes] [--remove-worktrees] [--force] [--json] [--run RUN] [--config PATH]\n');
        return 0;
      }
      const result = await cleanupRun({
        cwd,
        configPath: values.config,
        run: values.run,
        complete: values.complete,
        abandon: values.abandon,
        closePanes: values['close-panes'],
        removeWorktrees: values['remove-worktrees'],
        force: values.force,
        json: values.json,
        runner: nodeCommandRunner
      });
      process.stdout.write(result.text);
      return result.exitCode;
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
        process.stdout.write('Usage: pi-herd run <create|list> [args]\n');
        return 0;
      }
      if (subcommand === 'list') {
        const { values } = parseArgs({
          args: argv.slice(2),
          options: {
            all: { type: 'boolean', default: false },
            json: { type: 'boolean', default: false },
            config: { type: 'string' },
            help: { type: 'boolean', short: 'h', default: false }
          },
          allowPositionals: false
        });
        if (values.help) {
          process.stdout.write('Usage: pi-herd run list [--all] [--json] [--config PATH]\n');
          return 0;
        }
        const runs = await listRunsForInvocation(cwd, values.config, nodeCommandRunner, values.all);
        process.stdout.write(values.json ? `${JSON.stringify(runs, null, 2)}\n` : formatRunListText(runs));
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

export function formatRunListText(runs: ActiveRunSummary[]): string {
  if (!runs.length) {
    return 'No runs found.\n';
  }
  const lines = ['Runs:'];
  for (const run of runs) {
    lines.push(`- ${run.run_id} (${run.status}) ${run.goal}`);
  }
  return `${lines.join('\n')}\n`;
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
