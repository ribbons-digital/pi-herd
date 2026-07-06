import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { CONFIG_SCHEMA_VERSION, DEFAULT_PROMPTS_DIR, DEFAULT_ROLE_REGISTRY, DEFAULT_RUNS_DIR, type ExpectedWrites, type RoleDefinition, type RoleName } from './defaults.js';

export interface PiHerdConfig {
  schema_version: 1;
  harness: {
    default: string;
    profiles: ProfileMap;
  };
  paths: {
    runs_dir: string;
    prompts_dir: string;
  };
  roles: RoleRegistryConfig;
}

export interface RoleRegistryConfig {
  default: RoleName[];
  definitions: Record<RoleName, RoleDefinition>;
}

export type ProfileMap = Record<string, HarnessProfile>;
export type RoleStringMap = Record<string, string>;

export interface HarnessProfile {
  command: string;
  provider?: string | null;
  model?: string | null;
  thinking?: string | RoleStringMap | null;
  models?: RoleStringMap;
  args?: string[];
}

export function defaultConfig(): PiHerdConfig {
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    harness: {
      default: 'pi',
      profiles: {
        pi: {
          command: 'pi'
        }
      }
    },
    paths: {
      runs_dir: DEFAULT_RUNS_DIR,
      prompts_dir: DEFAULT_PROMPTS_DIR
    },
    roles: cloneRoleRegistry(DEFAULT_ROLE_REGISTRY)
  };
}

export function serializeConfig(config: PiHerdConfig = defaultConfig()): string {
  return stringify(config, {
    lineWidth: 0,
    nullStr: ''
  });
}

export async function writeDefaultConfig(path: string): Promise<void> {
  await writeFile(path, serializeConfig(), 'utf8');
}

export async function loadConfig(path: string): Promise<PiHerdConfig> {
  const raw = await readFile(path, 'utf8');
  let value: unknown;
  try {
    value = parse(raw);
  } catch (error) {
    throw new Error(`Config YAML parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateConfig(value);
}

export function validateConfig(value: unknown): PiHerdConfig {
  if (!isRecord(value)) {
    throw new Error('Config must be a YAML mapping.');
  }
  if (value.schema_version !== CONFIG_SCHEMA_VERSION) {
    throw new Error(`Config schema_version must be ${CONFIG_SCHEMA_VERSION}.`);
  }
  if (!isRecord(value.harness)) {
    throw new Error('Config harness must be a mapping.');
  }
  if (typeof value.harness.default !== 'string' || value.harness.default.length === 0) {
    throw new Error('Config harness.default must be a non-empty string.');
  }
  if (!isRecord(value.harness.profiles)) {
    throw new Error('Config harness.profiles must be a mapping.');
  }
  const profiles: ProfileMap = Object.create(null) as ProfileMap;
  for (const [name, profile] of Object.entries(value.harness.profiles)) {
    if (!isSafeProfileName(name)) {
      throw new Error(`Harness profile name '${name}' is reserved.`);
    }
    if (!isRecord(profile)) {
      throw new Error(`Harness profile ${name} must be a mapping.`);
    }
    if (typeof profile.command !== 'string' || profile.command.length === 0) {
      throw new Error(`Harness profile ${name} command must be a non-empty string.`);
    }
    if (profile.provider !== undefined && profile.provider !== null && typeof profile.provider !== 'string') {
      throw new Error(`Harness profile ${name} provider must be a string or null when present.`);
    }
    if (profile.model !== undefined && profile.model !== null && typeof profile.model !== 'string') {
      throw new Error(`Harness profile ${name} model must be a string or null when present.`);
    }
    if (profile.thinking !== undefined && profile.thinking !== null && typeof profile.thinking !== 'string' && !isStringRecord(profile.thinking)) {
      throw new Error(`Harness profile ${name} thinking must be a string, role map, or null when present.`);
    }
    if (profile.models !== undefined && !isStringRecord(profile.models)) {
      throw new Error(`Harness profile ${name} models must be a role string map when present.`);
    }
    if (profile.args !== undefined && !isStringArray(profile.args)) {
      throw new Error(`Harness profile ${name} args must be a string array when present.`);
    }
    profiles[name] = {
      command: profile.command,
      provider: profile.provider === undefined ? undefined : profile.provider,
      model: profile.model === undefined ? undefined : profile.model,
      thinking: profile.thinking === undefined ? undefined : cloneThinking(profile.thinking),
      models: profile.models === undefined ? undefined : cloneStringRecord(profile.models),
      args: profile.args === undefined ? undefined : [...profile.args]
    };
  }
  if (!isSafeProfileName(value.harness.default) || !Object.hasOwn(profiles, value.harness.default)) {
    throw new Error(`Config harness.default '${value.harness.default}' must reference a profile.`);
  }
  if (!isRecord(value.paths)) {
    throw new Error('Config paths must be a mapping.');
  }
  if (typeof value.paths.runs_dir !== 'string' || value.paths.runs_dir.length === 0) {
    throw new Error('Config paths.runs_dir must be a non-empty string.');
  }
  if (typeof value.paths.prompts_dir !== 'string' || value.paths.prompts_dir.length === 0) {
    throw new Error('Config paths.prompts_dir must be a non-empty string.');
  }
  return {
    schema_version: CONFIG_SCHEMA_VERSION,
    harness: {
      default: value.harness.default,
      profiles
    },
    paths: {
      runs_dir: value.paths.runs_dir,
      prompts_dir: value.paths.prompts_dir
    },
    roles: validateRoleRegistry(value.roles)
  };
}

export function resolveConfigPath(cwd: string, configPath?: string): string {
  return resolve(cwd, configPath ?? '.pi-herd/config.yaml');
}

export function configDirectory(configPath: string): string {
  return dirname(configPath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

function cloneThinking(value: string | RoleStringMap | null): string | RoleStringMap | null {
  if (value === null || typeof value === 'string') {
    return value;
  }
  return cloneStringRecord(value) ?? Object.create(null) as RoleStringMap;
}

function cloneStringRecord(value: RoleStringMap | undefined): RoleStringMap | undefined {
  if (value === undefined) {
    return undefined;
  }
  const clone = Object.create(null) as RoleStringMap;
  for (const [key, item] of Object.entries(value)) {
    clone[key] = item;
  }
  return clone;
}

function validateRoleRegistry(value: unknown): RoleRegistryConfig {
  if (value === undefined) {
    return cloneRoleRegistry(DEFAULT_ROLE_REGISTRY);
  }
  if (!isRecord(value)) {
    throw new Error('Config roles must be a mapping when present.');
  }
  if (!isStringArray(value.default)) {
    throw new Error('Config roles.default must be a string array.');
  }
  if (value.default.length === 0) {
    throw new Error('Config roles.default must include at least one role.');
  }
  if (!isRecord(value.definitions)) {
    throw new Error('Config roles.definitions must be a mapping.');
  }
  const definitions = Object.create(null) as Record<RoleName, RoleDefinition>;
  for (const [role, definition] of Object.entries(value.definitions)) {
    assertSafeRoleName(role, `Config roles.definitions role '${role}'`);
    if (!isRecord(definition)) {
      throw new Error(`Config roles.definitions.${role} must be a mapping.`);
    }
    if (typeof definition.display_name !== 'string' || definition.display_name.trim().length === 0) {
      throw new Error(`Config roles.definitions.${role}.display_name must be a non-empty string.`);
    }
    if (!isExpectedWrites(definition.expected_writes)) {
      throw new Error(`Config roles.definitions.${role}.expected_writes must be one of none, artifacts, or worktree.`);
    }
    if (definition.expected_writes === 'worktree' && (role === 'planner' || role === 'reviewer' || role === 'tester')) {
      throw new Error(`Config roles.definitions.${role}.expected_writes cannot be worktree because planner, reviewer, and tester keep built-in orchestration semantics.`);
    }
    if (!isStringArray(definition.required_artifacts)) {
      throw new Error(`Config roles.definitions.${role}.required_artifacts must be a string array.`);
    }
    for (const artifact of definition.required_artifacts) {
      if (
        artifact.length === 0
        || artifact.includes('..')
        || artifact.includes('/')
        || artifact.includes('\\')
        || artifact.startsWith('.')
        || artifact.includes(':')
      ) {
        throw new Error(`Config roles.definitions.${role}.required_artifacts entries must be top-level relative filenames without path traversal.`);
      }
    }
    definitions[role] = {
      display_name: definition.display_name,
      expected_writes: definition.expected_writes,
      required_artifacts: [...definition.required_artifacts]
    };
  }
  const defaultRoles = value.default.map((role) => {
    assertSafeRoleName(role, `Config roles.default role '${role}'`);
    if (!Object.hasOwn(definitions, role)) {
      throw new Error(`Config roles.default role '${role}' must reference roles.definitions.`);
    }
    return role;
  });
  return { default: defaultRoles, definitions };
}

export function assertSafeRoleName(value: string, label = 'Role name'): void {
  if (!isSafeRoleName(value)) {
    throw new Error(`${label} must use lowercase letters, numbers, underscores, or hyphens; start with a letter or number; and not contain path traversal or reserved object names.`);
  }
}

export function isSafeRoleName(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*$/.test(value)
    && value !== '__proto__'
    && value !== 'constructor'
    && value !== 'prototype'
    && value !== 'toString'
    && !value.includes('..')
    && !value.includes('/')
    && !value.includes('\\');
}

function isExpectedWrites(value: unknown): value is ExpectedWrites {
  return value === 'none' || value === 'artifacts' || value === 'worktree';
}

function cloneRoleRegistry(value: RoleRegistryConfig): RoleRegistryConfig {
  const definitions = Object.create(null) as Record<RoleName, RoleDefinition>;
  for (const [role, definition] of Object.entries(value.definitions)) {
    definitions[role] = {
      display_name: definition.display_name,
      expected_writes: definition.expected_writes,
      required_artifacts: [...definition.required_artifacts]
    };
  }
  return { default: [...value.default], definitions };
}

function isSafeProfileName(value: string): boolean {
  return value !== '__proto__' && value !== 'constructor' && value !== 'prototype' && value !== 'toString';
}
