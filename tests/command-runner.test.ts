import { describe, expect, it } from 'vitest';
import { nodeCommandRunner } from '../src/command-runner.js';

describe('nodeCommandRunner', () => {
  it('times out stuck child processes', async () => {
    const result = await nodeCommandRunner.run(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], { timeoutMs: 20 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });

  it('escalates when a child ignores SIGTERM', async () => {
    const result = await nodeCommandRunner.run(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], { timeoutMs: 100 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
  });
});
