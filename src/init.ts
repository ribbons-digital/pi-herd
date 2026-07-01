import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DEFAULT_PROMPTS_DIR, DEFAULT_RUNS_DIR, DEFAULT_WORKTREES_DIR, ROLE_DEFAULTS } from './defaults.js';
import { resolveConfigPath, writeDefaultConfig } from './config.js';

export interface InitOptions {
  cwd: string;
  configPath?: string;
  force?: boolean;
}

export interface InitResult {
  configPath: string;
  created: string[];
  updated: string[];
  skipped: string[];
}

const GITIGNORE_LINES = [`/${DEFAULT_RUNS_DIR}/`, `/${DEFAULT_WORKTREES_DIR.replace(/\/$/, '')}/`];

export async function runInit(options: InitOptions): Promise<InitResult> {
  const configPath = resolveConfigPath(options.cwd, options.configPath);
  const configDir = dirname(configPath);
  const runsDir = resolve(options.cwd, DEFAULT_RUNS_DIR);
  const promptsDir = resolve(options.cwd, DEFAULT_PROMPTS_DIR);
  const result: InitResult = { configPath, created: [], updated: [], skipped: [] };

  await ensureDir(configDir, result);
  await ensureDir(runsDir, result);
  await ensureDir(promptsDir, result);

  if (await exists(configPath)) {
    if (options.force) {
      await writeDefaultConfig(configPath);
      result.updated.push(configPath);
    } else {
      result.skipped.push(configPath);
    }
  } else {
    await writeDefaultConfig(configPath);
    result.created.push(configPath);
  }

  for (const [role, defaults] of Object.entries(ROLE_DEFAULTS)) {
    const path = join(promptsDir, `${role}.md`);
    const body = promptTemplate(defaults.displayName, defaults.expectedWrites, defaults.requiredArtifacts);
    if (await exists(path)) {
      if (options.force) {
        await writeFile(path, body, 'utf8');
        result.updated.push(path);
      } else {
        result.skipped.push(path);
      }
    } else {
      await writeFile(path, body, 'utf8');
      result.created.push(path);
    }
  }

  await updateGitignore(options.cwd, result);

  return result;
}

export function formatInitText(result: InitResult): string {
  const lines = [`Initialized pi-herd config at ${result.configPath}.`];
  if (result.created.length) {
    lines.push(`Created ${result.created.length} item(s).`);
  }
  if (result.updated.length) {
    lines.push(`Updated ${result.updated.length} item(s).`);
  }
  if (result.skipped.length) {
    lines.push(`Skipped ${result.skipped.length} existing item(s). Use --force to overwrite config and prompts.`);
  }
  return `${lines.join('\n')}\n`;
}

async function ensureDir(path: string, result: InitResult): Promise<void> {
  if (await exists(path)) {
    return;
  }
  await mkdir(path, { recursive: true });
  result.created.push(path);
}

async function updateGitignore(cwd: string, result: InitResult): Promise<void> {
  const path = resolve(cwd, '.gitignore');
  let existing = '';
  if (await exists(path)) {
    existing = await readFile(path, 'utf8');
  }
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = GITIGNORE_LINES.filter((line) => !existingLines.has(line));
  if (!missing.length) {
    result.skipped.push(path);
    return;
  }
  const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
  const body = `${existing}${prefix}${missing.join('\n')}\n`;
  await writeFile(path, body, 'utf8');
  if (existing.length) {
    result.updated.push(path);
  } else {
    result.created.push(path);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function promptTemplate(displayName: string, expectedWrites: string, requiredArtifacts: string[]): string {
  return `# ${displayName} prompt template

You are the ${displayName.toLowerCase()} worker for a pi-herd run.
Write durable results to the canonical run directory.

Expected writes: ${expectedWrites}.
Required artifact(s): ${requiredArtifacts.join(', ')}.

Follow the lead session's instructions and leave questions in the lead inbox instead of coordinating directly with other workers.
`;
}
