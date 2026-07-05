import { describe, expect, it } from 'vitest';
import { notificationShow, parsePaneMetadata, parseWorktreeCreateResult } from '../src/herdr.js';

const normalizePath = (path: string) => path;
const isAbsolutePath = (path: string) => path.startsWith('/');

describe('Herdr metadata parsing', () => {
  it('parses pane metadata from flat and enveloped responses', () => {
    expect(parsePaneMetadata(JSON.stringify({ pane_id: 'p1', workspace_id: 'w1', tab_id: 't1' }))).toEqual({ paneId: 'p1', workspaceId: 'w1', tabId: 't1' });
    expect(parsePaneMetadata(JSON.stringify({ id: 'cli:pane:current', result: { pane: { pane_id: 'p2', workspace_id: 'w2', tab_id: 't2' } } }))).toEqual({ paneId: 'p2', workspaceId: 'w2', tabId: 't2' });
    expect(parsePaneMetadata(JSON.stringify({ result: { terminal: { id: 'p3' }, workspace_id: 'w3' } })).paneId).toBe('p3');
  });

  it('strictly parses worktree create metadata', () => {
    const accepted = parseWorktreeCreateResult(JSON.stringify({ result: { data: { workspace: { id: 'ws1' }, worktree: { checkout_path: '/repo/.worktrees/pi-herd/run/reviewer', branch_name: 'pi-herd/run/reviewer' } } } }), {
      role: 'reviewer',
      branch: 'pi-herd/run/reviewer',
      path: '/repo/.worktrees/pi-herd/run/reviewer',
      isAbsolutePath,
      normalizePath
    });
    expect(accepted).toMatchObject({ herdr_workspace_id: 'ws1', provider: 'herdr' });

    expect(parseWorktreeCreateResult(JSON.stringify({ workspace_id: 'ws1', checkout_path: '/repo/.worktrees/pi-herd/run/reviewer', branch: 'wrong' }), {
      role: 'reviewer',
      branch: 'pi-herd/run/reviewer',
      path: '/repo/.worktrees/pi-herd/run/reviewer',
      isAbsolutePath,
      normalizePath
    })).toBeNull();
    expect(parseWorktreeCreateResult(JSON.stringify({ workspace_id: 'ws1', checkout_path: 'relative', branch: 'pi-herd/run/reviewer' }), {
      role: 'reviewer',
      branch: 'pi-herd/run/reviewer',
      path: '/repo/.worktrees/pi-herd/run/reviewer',
      isAbsolutePath,
      normalizePath
    })).toBeNull();
  });
});

describe('Herdr notification helpers', () => {
  it('builds notification show commands with body and sound', async () => {
    const calls: unknown[] = [];
    const runner = {
      async run(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }) {
        calls.push([command, args, options]);
        return { exitCode: 0, stdout: '', stderr: '' };
      }
    };

    await notificationShow(runner, '/repo', { title: 'pi-herd run-1', body: 'planner: done', sound: 'done' });

    expect(calls).toEqual([
      ['herdr', ['notification', 'show', 'pi-herd run-1', '--body', 'planner: done', '--sound', 'done'], { cwd: '/repo', timeoutMs: 10_000 }]
    ]);
  });
});
