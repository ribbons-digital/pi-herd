import { describe, expect, it } from 'vitest';
import { defaultConfig, serializeConfig, validateConfig } from '../src/config.js';

const yaml = serializeConfig(defaultConfig());

describe('config', () => {
  it('generates compact default config without role null maps or context knobs', () => {
    expect(yaml).toContain('schema_version: 1');
    expect(yaml).toContain('default: pi');
    expect(yaml).not.toContain('roles:');
    expect(yaml).not.toContain('context:');
    expect(yaml).not.toContain('null');
  });

  it('validates the default config', () => {
    expect(validateConfig(defaultConfig())).toEqual(defaultConfig());
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
      schema_version: 1,
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
      },
      paths: defaultConfig().paths
    });

    expect(config.harness.profiles.pi.provider).toBe('anthropic');
    expect(config.harness.profiles.pi.models?.reviewer).toBe('claude-opus-4-8');
  });
});
