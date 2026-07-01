import { spawn } from 'node:child_process';

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut?: boolean;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export const nodeCommandRunner: CommandRunner = {
  run(command, args, options) {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options?.cwd,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      let stdout = '';
      let stderr = '';
      let settled = false;
      let closed = false;
      let killTimer: NodeJS.Timeout | undefined;
      const finish = (result: CommandResult, clearEscalation = true) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (clearEscalation && killTimer) {
          clearTimeout(killTimer);
        }
        resolve(result);
      };
      const safeKill = (signal: NodeJS.Signals) => {
        try {
          child.kill(signal);
        } catch {
          // The process may already have exited between timeout and escalation.
        }
      };
      const timer = setTimeout(() => {
        safeKill('SIGTERM');
        child.stdout?.destroy();
        child.stderr?.destroy();
        killTimer = setTimeout(() => {
          if (!closed) {
            safeKill('SIGKILL');
          }
        }, 250);
        finish({ exitCode: null, stdout, stderr, timedOut: true }, false);
      }, timeoutMs);
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        finish({ exitCode: null, stdout, stderr, error });
      });
      child.on('close', (exitCode) => {
        closed = true;
        if (killTimer) {
          clearTimeout(killTimer);
        }
        finish({ exitCode, stdout, stderr });
      });
    });
  }
};
