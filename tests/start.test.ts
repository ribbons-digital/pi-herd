import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPiCommand, startRun } from '../src/start.js';
import type { CommandResult, CommandRunner } from '../src/command-runner.js';
import type { RunState } from '../src/run-state.js';
import { defaultConfig } from '../src/config.js';

let dir: string;
const NOW = new Date('2026-07-01T12:00:00.000Z');
const RUN_ID = '2026-07-01T12-00-00-launch-sessions';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-start-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

class RecordingRunner implements CommandRunner {
  calls: string[] = [];

  constructor(private readonly responses: Record<string, CommandResult>) {}

  async run(command: string, args: string[]): Promise<CommandResult> {
    const key = [command, ...args].join(' ');
    this.calls.push(key);
    const response = this.responses[key.replaceAll(dir, 'DIR')];
    if (response) {
      return response;
    }
    if (command === 'git' && args[0] === 'show-ref') {
      return { exitCode: 1, stdout: '', stderr: '' };
    }
    if (command === 'herdr' && args[0] === 'wait' && args[1] === 'agent-status') {
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (command === 'herdr' && args[0] === 'pane' && args[1] === 'get') {
      return { exitCode: 0, stdout: JSON.stringify({ pane_id: args[2], agent_status: 'idle' }), stderr: '' };
    }
    throw new Error(`Unexpected command: ${key}`);
  }
}

describe('start orchestration', () => {
  it('builds Pi launch commands from role preferences', () => {
    const config = defaultConfig();
    config.harness.profiles.pi = {
      command: 'pi',
      provider: 'anthropic',
      model: 'default-model',
      models: { reviewer: 'opus' },
      thinking: { planner: 'high' },
      args: ['--offline']
    };
    const state = minimalState();

    const planner = buildPiCommand(config, 'planner', state);
    const reviewer = buildPiCommand(config, 'reviewer', state);

    expect(planner.args).toContain('--offline');
    expect(planner.args).toContain('--provider');
    expect(planner.args).toContain('anthropic');
    expect(planner.args).toContain('--model');
    expect(planner.args).toContain('default-model');
    expect(planner.args).toContain('--thinking');
    expect(planner.args).toContain('high');
    expect(reviewer.args).toContain('opus');
    expect(planner.metadata.expected_writes).toBe('artifacts');
  });

  it('binds current lead, launches planner and staged implementer, and leaves reviewer/tester slot-only', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson(envelopedPane('cli:pane:current', { pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' })),
      [worktreeCommand('launch-sessions')]: okJson({ workspace_id: 'impl-wt-ws', checkout_path: join(dir, '.worktrees/pi-herd', RUN_ID, 'implementer'), branch: `pi-herd/${RUN_ID}/impl` }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-launch-sessions-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-launch-sessions-planner --session-id 2026-07-01T12-00-00-launch-sessions-planner': okJson(envelopedPane('cli:agent:start', { pane_id: 'planner-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' })),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-launch-sessions.\nGoal: Launch sessions\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-launch-sessions/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' },
      'herdr agent start pi-herd-2026-07-01T12-00-00-launch-sessions-implementer --cwd DIR/.worktrees/pi-herd/2026-07-01T12-00-00-launch-sessions/implementer --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-launch-sessions-implementer --session-id 2026-07-01T12-00-00-launch-sessions-implementer': okJson({ pane_id: 'impl-pane', workspace_id: 'lead-ws', tab_id: 'impl-tab' })
    }));

    const result = await startRun({
      cwd: dir,
      goal: 'Launch sessions',
      now: NOW,
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', HERDR_WORKSPACE_ID: 'lead-ws', HERDR_TAB_ID: 'lead-tab', PI_CODING_AGENT: 'true' }
    });

    const waitIndex = runner.calls.indexOf('herdr wait agent-status planner-pane --status idle --timeout 15000');
    const sendIndex = runner.calls.findIndex((call) => call.startsWith('herdr pane send-text planner-pane'));
    expect(waitIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(waitIndex);
    expect(result.warnings).toEqual([]);
    expect(result.state.lead_binding.herdr_pane_id).toBe('lead-pane');
    expect(result.state.lead_binding.session_ref).toBeNull();
    expect(result.launched.find((launch) => launch.role === 'lead')?.sessionRef).toBeNull();
    expect(result.launched.find((launch) => launch.role === 'planner')?.sessionRef).toBe('2026-07-01T12-00-00-launch-sessions-planner');
    expect(result.launched.find((launch) => launch.role === 'implementer')?.sessionRef).toBe('2026-07-01T12-00-00-launch-sessions-implementer');
    expect(result.state.roles.planner?.status).toBe('working');
    expect(result.state.roles.planner?.herdr_pane_id).toBe('planner-pane');
    expect(result.state.roles.planner?.session_ref).toBe('2026-07-01T12-00-00-launch-sessions-planner');
    expect(result.state.roles.planner?.launch_metadata?.agent_name).toBe('pi-herd-2026-07-01T12-00-00-launch-sessions-planner');
    expect(result.state.roles.implementer?.status).toBe('staged');
    expect(result.state.roles.implementer?.herdr_pane_id).toBe('impl-pane');
    expect(result.state.roles.implementer?.session_ref).toBe('2026-07-01T12-00-00-launch-sessions-implementer');
    expect(result.state.roles.implementer?.worktree_herdr_workspace_id).toBe('impl-wt-ws');
    expect(result.state.roles.implementer?.herdr_workspace_id).toBe('lead-ws');
    expect(result.state.roles.reviewer?.status).toBe('staged');
    expect(result.state.roles.reviewer?.herdr_pane_id).toBeNull();
    expect(result.state.roles.tester?.status).toBe('staged');
    expect(result.state.roles.tester?.herdr_pane_id).toBeNull();
    expect(runner.calls.some((call) => call.startsWith('git status '))).toBe(true);
    expect(runner.calls.some((call) => call.includes('reviewer'))).toBe(false);

    const saved = JSON.parse(await readFile(result.statePath, 'utf8')) as RunState;
    expect(saved.lead_binding.session_ref).toBeNull();
    expect(saved.roles.planner?.launch_metadata?.launch_method).toBe('herdr-agent-start');
    expect(saved.roles.planner?.launch_metadata?.prompt_method).toBe('pane-send-text-enter');
  });

  it('refuses to start a duplicate active run from the same verified lead pane', async () => {
    const existingRunDir = join(dir, '.pi-herd/runs/existing-run');
    await mkdir(existingRunDir, { recursive: true });
    await writeFile(join(existingRunDir, 'state.json'), `${JSON.stringify({
      ...minimalState(),
      run_id: 'existing-run',
      run_slug: 'existing-run',
      goal: 'Existing run',
      canonical_run_dir: existingRunDir,
      lead_binding: { role: 'lead', harness: 'pi', herdr_workspace_id: 'lead-ws', herdr_tab_id: 'lead-tab', herdr_pane_id: 'lead-pane', session_ref: null }
    }, null, 2)}\n`, 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson(envelopedPane('cli:pane:current', { pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' }))
    }));

    await expect(startRun({
      cwd: dir,
      goal: 'Duplicate start',
      now: NOW,
      roles: ['planner'],
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', PI_CODING_AGENT: 'true' }
    })).rejects.toThrow(/already the lead for active pi-herd run existing-run/);
    await expect(readFile(join(dir, '.pi-herd/runs/2026-07-01T12-00-00-duplicate-start/state.json'), 'utf8')).rejects.toThrow();
  });

  it('continues when a matching stored lead pane cannot be verified as current', async () => {
    const existingRunDir = join(dir, '.pi-herd/runs/existing-run');
    await mkdir(existingRunDir, { recursive: true });
    await writeFile(join(existingRunDir, 'state.json'), `${JSON.stringify({
      ...minimalState(),
      run_id: 'existing-run',
      run_slug: 'existing-run',
      goal: 'Existing run',
      canonical_run_dir: existingRunDir,
      lead_binding: { role: 'lead', harness: 'pi', herdr_workspace_id: 'lead-ws', herdr_tab_id: 'lead-tab', herdr_pane_id: 'lead-pane', session_ref: null }
    }, null, 2)}\n`, 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson(envelopedPane('cli:pane:current', { pane_id: 'different-current-pane', workspace_id: 'other-ws', tab_id: 'other-tab' })),
      'herdr workspace create --cwd DIR --label pi-herd unverified-pane lead --no-focus': okJson({ workspace_id: 'new-lead-ws' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-unverified-pane-lead --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-unverified-pane-lead --session-id 2026-07-01T12-00-00-unverified-pane-lead': okJson({ pane_id: 'new-lead-pane', workspace_id: 'new-lead-ws', tab_id: 'new-lead-tab' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-unverified-pane-planner --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-unverified-pane-planner --session-id 2026-07-01T12-00-00-unverified-pane-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'new-lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-unverified-pane.\nGoal: Unverified pane\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-unverified-pane/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({
      cwd: dir,
      goal: 'Unverified pane',
      now: NOW,
      roles: ['planner'],
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', PI_CODING_AGENT: 'true' }
    });

    expect(result.state.lead_binding.herdr_pane_id).toBe('new-lead-pane');
    expect(result.state.lead_binding.session_ref).toBe('2026-07-01T12-00-00-unverified-pane-lead');
  });

  it('allows a different pane to start while another active run exists', async () => {
    const existingRunDir = join(dir, '.pi-herd/runs/existing-run');
    await mkdir(existingRunDir, { recursive: true });
    await writeFile(join(existingRunDir, 'state.json'), `${JSON.stringify({
      ...minimalState(),
      run_id: 'existing-run',
      run_slug: 'existing-run',
      goal: 'Existing run',
      canonical_run_dir: existingRunDir,
      lead_binding: { role: 'lead', harness: 'pi', herdr_workspace_id: 'other-ws', herdr_tab_id: 'other-tab', herdr_pane_id: 'other-pane', session_ref: null }
    }, null, 2)}\n`, 'utf8');
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson(envelopedPane('cli:pane:current', { pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' })),
      'herdr agent start pi-herd-2026-07-01T12-00-00-different-pane-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-different-pane-planner --session-id 2026-07-01T12-00-00-different-pane-planner': okJson(envelopedPane('cli:agent:start', { pane_id: 'planner-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' })),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-different-pane.\nGoal: Different pane\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-different-pane/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({
      cwd: dir,
      goal: 'Different pane',
      now: NOW,
      roles: ['planner'],
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', HERDR_WORKSPACE_ID: 'lead-ws', HERDR_TAB_ID: 'lead-tab', PI_CODING_AGENT: 'true' }
    });

    expect(result.state.lead_binding.herdr_pane_id).toBe('lead-pane');
    expect(result.state.run_id).toBe('2026-07-01T12-00-00-different-pane');
  });

  it('does not require a clean repo for planner-only starts without planner worktrees', async () => {
    const runner = new RecordingRunner({
      'git rev-parse --show-toplevel': { exitCode: 0, stdout: `${dir}\n`, stderr: '' },
      'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' },
      'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': { exitCode: 0, stdout: 'M src/start.ts\n', stderr: '' },
      ...normalize({
        'herdr workspace create --cwd DIR --label pi-herd planner-only lead --no-focus': okJson({ workspace_id: 'new-lead-ws' }),
        'herdr agent start pi-herd-2026-07-01T12-00-00-planner-only-lead --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-planner-only-lead --session-id 2026-07-01T12-00-00-planner-only-lead': okJson({ pane_id: 'new-lead-pane', workspace_id: 'new-lead-ws', tab_id: 'new-lead-tab' }),
        'herdr agent start pi-herd-2026-07-01T12-00-00-planner-only-planner --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-planner-only-planner --session-id 2026-07-01T12-00-00-planner-only-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'new-lead-ws', tab_id: 'planner-tab' }),
        'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-planner-only.\nGoal: Planner only\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-planner-only/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
        'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
      })
    });

    const result = await startRun({ cwd: dir, goal: 'Planner only', now: NOW, roles: ['planner'], runner, env: {} });

    expect(result.state.roles.planner?.worktree_path).toBeNull();
    expect(result.state.roles.planner?.status).toBe('working');
    expect(runner.calls.some((call) => call.startsWith('git status '))).toBe(false);
  });

  it('warns and still sends planner kickoff when readiness wait times out', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr workspace create --cwd DIR --label pi-herd slow-planner lead --no-focus': okJson({ workspace_id: 'new-lead-ws' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-slow-planner-lead --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-slow-planner-lead --session-id 2026-07-01T12-00-00-slow-planner-lead': okJson({ pane_id: 'new-lead-pane', workspace_id: 'new-lead-ws', tab_id: 'new-lead-tab' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-slow-planner-planner --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-slow-planner-planner --session-id 2026-07-01T12-00-00-slow-planner-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'new-lead-ws', tab_id: 'planner-tab' }),
      'herdr wait agent-status planner-pane --status idle --timeout 15000': { exitCode: null, stdout: '', stderr: '', timedOut: true },
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-slow-planner.\nGoal: Slow planner\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-slow-planner/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({ cwd: dir, goal: 'Slow planner', now: NOW, roles: ['planner'], runner, env: {} });

    expect(result.warnings.join('\n')).toContain('planner pane did not report idle');
    expect(result.state.roles.planner?.status).toBe('working');
  });

  it('reports spawn errors when Herdr workspace creation fails', async () => {
    const spawnError = Object.assign(new Error('spawn herdr ENOENT'), { code: 'ENOENT' }) as NodeJS.ErrnoException;
    const runner = new RecordingRunner(baseResponses({
      'herdr workspace create --cwd DIR --label pi-herd missing-herdr lead --no-focus': { exitCode: null, stdout: '', stderr: '', error: spawnError }
    }));

    await expect(startRun({ cwd: dir, goal: 'Missing Herdr', now: NOW, roles: ['planner'], runner, env: {} })).rejects.toThrow(/ENOENT: spawn herdr ENOENT/);
  });

  it('creates a lead workspace and session when no current lead is verified', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr workspace create --cwd DIR --label pi-herd shell-start lead --no-focus': okJson({ workspace_id: 'new-lead-ws' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-shell-start-lead --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-shell-start-lead --session-id 2026-07-01T12-00-00-shell-start-lead': okJson({ pane_id: 'new-lead-pane', workspace_id: 'new-lead-ws', tab_id: 'new-lead-tab' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-shell-start-planner --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-shell-start-planner --session-id 2026-07-01T12-00-00-shell-start-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'new-lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-shell-start.\nGoal: Shell start\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-shell-start/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({ cwd: dir, goal: 'Shell start', now: NOW, roles: ['planner'], runner, env: {} });

    expect(result.state.lead_binding.herdr_workspace_id).toBe('new-lead-ws');
    expect(result.state.lead_binding.herdr_pane_id).toBe('new-lead-pane');
    expect(result.state.lead_binding.session_ref).toBe('2026-07-01T12-00-00-shell-start-lead');
    expect(result.state.roles.planner?.status).toBe('working');
  });

  it('uses nested workspace ids from enveloped workspace create output', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr workspace create --cwd DIR --label pi-herd nested-workspace lead --no-focus': okJson({ id: 'cli:workspace:create', result: { workspace: { id: 'nested-lead-ws' } } }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-nested-workspace-lead --cwd DIR --workspace nested-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-nested-workspace-lead --session-id 2026-07-01T12-00-00-nested-workspace-lead': okJson({ pane_id: 'new-lead-pane', workspace_id: 'nested-lead-ws', tab_id: 'new-lead-tab' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-nested-workspace-planner --cwd DIR --workspace nested-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-nested-workspace-planner --session-id 2026-07-01T12-00-00-nested-workspace-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'nested-lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-nested-workspace.\nGoal: Nested workspace\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-nested-workspace/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({ cwd: dir, goal: 'Nested workspace', now: NOW, roles: ['planner'], runner, env: {} });

    expect(result.state.lead_binding.herdr_workspace_id).toBe('nested-lead-ws');
    expect(runner.calls.some((call) => call.includes('--workspace cli:workspace:create'))).toBe(false);
  });

  it('falls back to pane split and pane run when worker agent start fails', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-worker-fallback-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-worker-fallback-planner --session-id 2026-07-01T12-00-00-worker-fallback-planner': { exitCode: 1, stdout: '', stderr: 'agent unavailable\n' },
      'herdr pane split lead-pane --direction down --cwd DIR --no-focus': okJson({ pane_id: 'fallback-pane', workspace_id: 'lead-ws', tab_id: 'fallback-tab' }),
      'herdr pane run fallback-pane pi --name pi-herd-2026-07-01T12-00-00-worker-fallback-planner --session-id 2026-07-01T12-00-00-worker-fallback-planner': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-text fallback-pane You are the planner for pi-herd run 2026-07-01T12-00-00-worker-fallback.\nGoal: Worker fallback\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-worker-fallback/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys fallback-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({
      cwd: dir,
      goal: 'Worker fallback',
      now: NOW,
      roles: ['planner'],
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', PI_CODING_AGENT: 'true' }
    });

    expect(result.state.roles.planner?.herdr_pane_id).toBe('fallback-pane');
    expect(result.state.roles.planner?.session_ref).toBe('2026-07-01T12-00-00-worker-fallback-planner');
    expect(result.state.roles.planner?.launch_metadata?.launch_method).toBe('herdr-pane-run');
  });

  it('marks state failed while preserving persisted launch refs after a later kickoff failure', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr pane current --current': okJson({ pane_id: 'lead-pane', workspace_id: 'lead-ws', tab_id: 'lead-tab' }),
      [worktreeCommand('kickoff-fails')]: okJson({ workspace_id: 'impl-wt-ws', checkout_path: join(dir, '.worktrees/pi-herd', '2026-07-01T12-00-00-kickoff-fails', 'implementer'), branch: 'pi-herd/2026-07-01T12-00-00-kickoff-fails/impl' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-kickoff-fails-planner --cwd DIR --workspace lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-kickoff-fails-planner --session-id 2026-07-01T12-00-00-kickoff-fails-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'lead-ws', tab_id: 'planner-tab' }),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-kickoff-fails.\nGoal: Kickoff fails\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-kickoff-fails/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 1, stdout: '', stderr: 'send failed\n' }
    }));

    await expect(startRun({
      cwd: dir,
      goal: 'Kickoff fails',
      now: NOW,
      runner,
      env: { HERDR_ENV: '1', HERDR_PANE_ID: 'lead-pane', PI_CODING_AGENT: 'true' }
    })).rejects.toThrow(/send failed/);

    const state = JSON.parse(await readFile(join(dir, '.pi-herd/runs/2026-07-01T12-00-00-kickoff-fails/state.json'), 'utf8')) as RunState;
    expect(state.status).toBe('failed');
    expect(state.lead_binding.herdr_pane_id).toBe('lead-pane');
    expect(state.roles.planner?.herdr_pane_id).toBe('planner-pane');
    expect(state.roles.planner?.status).toBe('failed');
  });

  it('records a kickoff warning and still succeeds when the planner pane was already working', async () => {
    const runner = new RecordingRunner(baseResponses({
      'herdr workspace create --cwd DIR --label pi-herd busy-planner lead --no-focus': okJson({ workspace_id: 'new-lead-ws' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-busy-planner-lead --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-busy-planner-lead --session-id 2026-07-01T12-00-00-busy-planner-lead': okJson({ pane_id: 'new-lead-pane', workspace_id: 'new-lead-ws', tab_id: 'new-lead-tab' }),
      'herdr agent start pi-herd-2026-07-01T12-00-00-busy-planner-planner --cwd DIR --workspace new-lead-ws --split down --no-focus -- pi --name pi-herd-2026-07-01T12-00-00-busy-planner-planner --session-id 2026-07-01T12-00-00-busy-planner-planner': okJson({ pane_id: 'planner-pane', workspace_id: 'new-lead-ws', tab_id: 'planner-tab' }),
      'herdr pane get planner-pane': okJson({ pane_id: 'planner-pane', agent_status: 'working' }),
      'herdr pane send-text planner-pane You are the planner for pi-herd run 2026-07-01T12-00-00-busy-planner.\nGoal: Busy planner\nWrite your plan to DIR/.pi-herd/runs/2026-07-01T12-00-00-busy-planner/PLAN.md.\nDo not edit source files unless explicitly instructed by the lead.': { exitCode: 0, stdout: '', stderr: '' },
      'herdr pane send-keys planner-pane enter': { exitCode: 0, stdout: '', stderr: '' }
    }));

    const result = await startRun({ cwd: dir, goal: 'Busy planner', now: NOW, roles: ['planner'], runner, env: {} });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^planner kickoff: pane planner-pane was already working/);
    expect(result.state.status).toBe('active');
    expect(result.state.roles.planner?.status).toBe('working');
    expect(runner.calls).not.toContain('herdr wait agent-status planner-pane --status working --timeout 10000');
  });
});

function minimalState(): RunState {
  return {
    schema_version: 1,
    run_id: RUN_ID,
    run_slug: 'launch-sessions',
    goal: 'Launch sessions',
    status: 'active',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    repo_root: dir,
    base_ref: 'main',
    canonical_run_dir: join(dir, '.pi-herd/runs', RUN_ID),
    lead_binding: { role: 'lead', harness: 'pi', herdr_workspace_id: null, herdr_tab_id: null, herdr_pane_id: null, session_ref: null },
    roles: {}
  };
}

function baseResponses(overrides: Record<string, CommandResult>): Record<string, CommandResult> {
  return {
    'git rev-parse --show-toplevel': { exitCode: 0, stdout: `${dir}\n`, stderr: '' },
    'git symbolic-ref --short HEAD': { exitCode: 0, stdout: 'main\n', stderr: '' },
    'git status --porcelain --untracked-files=all -- . :!.pi-herd/runs :!.worktrees': { exitCode: 0, stdout: '', stderr: '' },
    ...normalize(overrides)
  };
}

function normalize(responses: Record<string, CommandResult>): Record<string, CommandResult> {
  const normalized: Record<string, CommandResult> = {};
  for (const [key, value] of Object.entries(responses)) {
    normalized[key.replaceAll(dir, 'DIR')] = value;
  }
  return normalized;
}

function worktreeCommand(slug: string): string {
  const runId = `2026-07-01T12-00-00-${slug}`;
  return `herdr worktree create --cwd DIR --branch pi-herd/${runId}/impl --base main --path DIR/.worktrees/pi-herd/${runId}/implementer --label pi-herd ${slug} implementer --no-focus --json`;
}

function okJson(value: unknown): CommandResult {
  return { exitCode: 0, stdout: JSON.stringify(value), stderr: '' };
}

function envelopedPane(id: string, pane: Record<string, unknown>): Record<string, unknown> {
  return { id, result: { pane } };
}
