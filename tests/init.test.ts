import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from '../src/init.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pi-herd-init-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('init', () => {
  it('creates config with roles, prompts, runs directory, and ignore entries', async () => {
    const result = await runInit({ cwd: dir });
    expect(result.created.length).toBeGreaterThan(0);

    const config = await readFile(join(dir, '.pi-herd/config.yaml'), 'utf8');
    expect(config).toContain('roles:');
    expect(config).toContain('  default:');
    expect(config).toContain('    - planner');
    expect(config).toContain('    - implementer');
    expect(config).toContain('display_name: Planner');
    expect(config).toContain('expected_writes: worktree');
    expect(config).not.toContain('context:');

    const plannerPrompt = await readFile(join(dir, '.pi-herd/prompts/planner.md'), 'utf8');
    expect(plannerPrompt).toContain('Required artifact(s): PLAN.md');
    const reviewerPrompt = await readFile(join(dir, '.pi-herd/prompts/reviewer.md'), 'utf8');
    expect(reviewerPrompt).toContain('For repeated passes, wait for the lead to refresh your role worktree');
    expect(reviewerPrompt).toContain('Treat your role worktree as read-only source context');

    const gitignore = await readFile(join(dir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('/.pi-herd/runs/');
    expect(gitignore).toContain('/.worktrees/');
  });

  it('instructs workers to end required artifacts with the verdict protocol line', async () => {
    await runInit({ cwd: dir });

    for (const role of ['planner', 'implementer', 'reviewer', 'tester']) {
      const prompt = await readFile(join(dir, `.pi-herd/prompts/${role}.md`), 'utf8');
      expect(prompt).toContain('pi-herd-verdict: done pass=<N>');
      expect(prompt).toContain('Use blocked instead of done when you cannot proceed');
    }
  });

  it('does not overwrite config or prompts without force', async () => {
    await runInit({ cwd: dir });
    await writeFile(join(dir, '.pi-herd/config.yaml'), 'custom: true\n', 'utf8');
    await writeFile(join(dir, '.pi-herd/prompts/planner.md'), 'custom prompt\n', 'utf8');

    const result = await runInit({ cwd: dir });

    expect(result.skipped).toContain(join(dir, '.pi-herd/config.yaml'));
    await expect(readFile(join(dir, '.pi-herd/config.yaml'), 'utf8')).resolves.toBe('custom: true\n');
    await expect(readFile(join(dir, '.pi-herd/prompts/planner.md'), 'utf8')).resolves.toBe('custom prompt\n');
  });

  it('overwrites config and prompts with force', async () => {
    await runInit({ cwd: dir });
    await writeFile(join(dir, '.pi-herd/config.yaml'), 'custom: true\n', 'utf8');

    const result = await runInit({ cwd: dir, force: true });

    expect(result.updated).toContain(join(dir, '.pi-herd/config.yaml'));
    await expect(readFile(join(dir, '.pi-herd/config.yaml'), 'utf8')).resolves.toContain('schema_version: 1');
  });
});
