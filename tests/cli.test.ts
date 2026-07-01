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
});
