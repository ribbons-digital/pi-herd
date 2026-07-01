import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli.js';

describe('cli main', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an exit code instead of throwing for parse errors', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(main(['doctor', '--unknown'])).resolves.toBe(1);
  });

  it('accepts a leading argument separator from package script invocations', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await expect(main(['--', '--help'])).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join('')).toContain('pi-herd run create');
  });

  it('creates a run from the CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pi-herd-cli-'));
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await expect(main(['run', 'create', 'Add run state'], dir)).resolves.toBe(0);
      expect(stdout.mock.calls.join('\n')).toContain('Created run');
      const runsDir = join(dir, '.pi-herd/runs');
      const output = stdout.mock.calls.flat().join('');
      const runId = output.match(/Created run (\S+)/)?.[1];
      expect(runId).toBeTruthy();
      await expect(readFile(join(runsDir, runId ?? '', 'state.json'), 'utf8')).resolves.toContain('add-run-state');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
