#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runDoctor, formatDoctorText } from './doctor.js';
import { nodeCommandRunner } from './command-runner.js';
import { runInit, formatInitText } from './init.js';
import { createRun, formatRunCreateText, parseRole } from './run-state.js';

const HELP = `pi-herd

Usage:
  pi-herd doctor [--json] [--config PATH]
  pi-herd init [--force] [--config PATH]
  pi-herd run create <goal> [--with-worktrees] [--planner-worktree] [--role ROLE] [--base-ref REF] [--json] [--config PATH]
  pi-herd --help

Commands:
  doctor  Check the local environment and pi-herd config.
  init    Create .pi-herd config, run directory, prompts, and ignore entries.
  run     Create and manage orchestration run state.
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
      const result = await createRun({
        cwd,
        goal,
        configPath: values.config,
        roles,
        baseRef: values['base-ref'],
        withWorktrees: values['with-worktrees'],
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  }, (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
