import { describe, expect, it } from 'vitest';
import { defaultConfig, serializeConfig, validateConfig } from '../src/config.js';

const yaml = serializeConfig(defaultConfig());

describe('config', () => {
  it('generates a default config with an editable role registry and no context knobs', () => {
    expect(yaml).toContain('schema_version: 1');
    expect(yaml).toContain('default: pi');
    expect(yaml).toContain('roles:');
    expect(yaml).toContain('  default:');
    expect(yaml).toContain('    - planner');
    expect(yaml).toContain('    - implementer');
    expect(yaml).toContain('    - reviewer');
    expect(yaml).toContain('    - tester');
    expect(yaml).toContain('display_name: Planner');
    expect(yaml).toContain('expected_writes: worktree');
    expect(yaml).not.toContain('context:');
    expect(yaml).not.toContain('null');
  });

  it('validates the default config', () => {
    expect(validateConfig(defaultConfig())).toEqual(defaultConfig());
  });

  it('validates legacy configs that omit roles using the built-in registry', () => {
    const config = validateConfig(legacyConfig());

    expect(config.roles.default).toEqual(['planner', 'implementer', 'reviewer', 'tester']);
    expect(config.roles.definitions.planner).toMatchObject({
      display_name: 'Planner',
      expected_writes: 'artifacts',
      required_artifacts: ['PLAN.md']
    });
    expect(config.roles.definitions.implementer).toMatchObject({
      display_name: 'Implementer',
      expected_writes: 'worktree',
      required_artifacts: ['IMPLEMENTATION_NOTES.md']
    });
  });

  it('accepts safe custom artifact and none role definitions', () => {
    const config = validateConfig({
      ...legacyConfig(),
      roles: {
        default: ['planner', 'audit_bot', 'observer'],
        definitions: {
          planner: {
            display_name: 'Planner',
            expected_writes: 'artifacts',
            required_artifacts: ['PLAN.md']
          },
          audit_bot: {
            display_name: 'Audit Bot',
            expected_writes: 'artifacts',
            required_artifacts: ['AUDIT.md']
          },
          observer: {
            display_name: 'Observer',
            expected_writes: 'none',
            required_artifacts: []
          }
        }
      }
    });

    expect(config.roles.default).toEqual(['planner', 'audit_bot', 'observer']);
    expect(config.roles.definitions.audit_bot).toEqual({
      display_name: 'Audit Bot',
      expected_writes: 'artifacts',
      required_artifacts: ['AUDIT.md']
    });
    expect(config.roles.definitions.observer).toEqual({
      display_name: 'Observer',
      expected_writes: 'none',
      required_artifacts: []
    });
  });

  it('rejects unsafe required_artifacts entries in role definitions', () => {
    for (const artifact of ['../outside.md', 'nested/REPORT.md', '', '.hidden', 'C:\\outside.md']) {
      expect(() => validateConfig({
        ...legacyConfig(),
        roles: {
          default: ['planner'],
          definitions: {
            planner: {
              display_name: 'Planner',
              expected_writes: 'artifacts',
              required_artifacts: [artifact]
            }
          }
        }
      })).toThrow(/top-level relative filenames/);
    }
  });

  it('rejects unsafe role names in definitions and default selections', () => {
    expect(() => validateConfig({
      ...legacyConfig(),
      roles: {
        default: ['planner'],
        definitions: {
          '../planner': {
            display_name: 'Planner',
            expected_writes: 'artifacts',
            required_artifacts: ['PLAN.md']
          }
        }
      }
    })).toThrow(/must use lowercase letters/);

    expect(() => validateConfig({
      ...legacyConfig(),
      roles: {
        default: ['bad/role'],
        definitions: {
          planner: {
            display_name: 'Planner',
            expected_writes: 'artifacts',
            required_artifacts: ['PLAN.md']
          }
        }
      }
    })).toThrow(/must use lowercase letters/);
  });

  it('rejects an explicit empty roles.default selection with a roles.default error', () => {
    expect(() => validateConfig({
      ...legacyConfig(),
      roles: {
        default: [],
        definitions: {
          planner: {
            display_name: 'Planner',
            expected_writes: 'artifacts',
            required_artifacts: ['PLAN.md']
          }
        }
      }
    })).toThrow(/roles\.default/);
  });

  it('rejects roles.default entries that are not defined', () => {
    expect(() => validateConfig({
      ...legacyConfig(),
      roles: {
        default: ['planner', 'missing_role'],
        definitions: {
          planner: {
            display_name: 'Planner',
            expected_writes: 'artifacts',
            required_artifacts: ['PLAN.md']
          }
        }
      }
    })).toThrow(/must reference roles\.definitions/);
  });

  it('rejects custom worktree-writing roles while still allowing the built-in implementer', () => {
    expect(validateConfig({
      ...legacyConfig(),
      roles: {
        default: ['implementer'],
        definitions: {
          implementer: {
            display_name: 'Implementer',
            expected_writes: 'worktree',
            required_artifacts: ['IMPLEMENTATION_NOTES.md']
          }
        }
      }
    }).roles.definitions.implementer?.expected_writes).toBe('worktree');

    expect(() => validateConfig({
      ...legacyConfig(),
      roles: {
        default: ['implementation_writer'],
        definitions: {
          implementation_writer: {
            display_name: 'Implementation Writer',
            expected_writes: 'worktree',
            required_artifacts: ['IMPLEMENTATION_NOTES.md']
          }
        }
      }
    })).toThrow(/cannot be worktree/);
  });

  it('rejects an unknown default harness profile', () => {
    expect(() => validateConfig({
      ...defaultConfig(),
      harness: {
        default: 'missing',
        profiles: defaultConfig().harness.profiles
      }
    })).toThrow(/must reference a profile/);
  });

  it('rejects reserved profile names instead of treating prototype members as profiles', () => {
    expect(() => validateConfig({
      ...defaultConfig(),
      harness: {
        default: 'toString',
        profiles: defaultConfig().harness.profiles
      }
    })).toThrow(/must reference a profile/);

    expect(() => validateConfig({
      ...defaultConfig(),
      harness: {
        default: 'constructor',
        profiles: {
          constructor: {
            command: 'pi'
          }
        }
      }
    })).toThrow(/reserved/);
  });

  it('accepts spec-documented Pi profile preferences without emitting them by default', () => {
    const config = validateConfig({
      ...legacyConfig(),
      harness: {
        default: 'pi',
        profiles: {
          pi: {
            command: 'pi',
            provider: 'anthropic',
            model: 'claude-sonnet-4',
            thinking: {
              reviewer: 'high'
            },
            models: {
              reviewer: 'claude-opus-4-8'
            }
          }
        }
      }
    });

    expect(config.harness.profiles.pi.provider).toBe('anthropic');
    expect(config.harness.profiles.pi.models?.reviewer).toBe('claude-opus-4-8');
  });
});

function legacyConfig() {
  return {
    schema_version: 1,
    harness: {
      default: 'pi',
      profiles: {
        pi: {
          command: 'pi'
        }
      }
    },
    paths: defaultConfig().paths
  };
}
