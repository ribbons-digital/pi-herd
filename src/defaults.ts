export const CONFIG_SCHEMA_VERSION = 1;

export const DEFAULT_CONFIG_RELATIVE_PATH = '.pi-herd/config.yaml';
export const DEFAULT_RUNS_DIR = '.pi-herd/runs';
export const DEFAULT_PROMPTS_DIR = '.pi-herd/prompts';
export const DEFAULT_WORKTREES_DIR = '.worktrees/';

export const OUTPUT_BUDGETS = {
  terminalSummaryLines: 80,
  paneReadLines: 200,
  artifactPreviewBytes: 24_000
} as const;

export type BuiltInRole = 'planner' | 'implementer' | 'reviewer' | 'tester';

export interface RoleDefault {
  role: BuiltInRole;
  displayName: string;
  expectedWrites: 'none' | 'artifacts' | 'worktree';
  requiredArtifacts: string[];
}

export const ROLE_DEFAULTS: Record<BuiltInRole, RoleDefault> = {
  planner: {
    role: 'planner',
    displayName: 'Planner',
    expectedWrites: 'artifacts',
    requiredArtifacts: ['PLAN.md']
  },
  implementer: {
    role: 'implementer',
    displayName: 'Implementer',
    expectedWrites: 'worktree',
    requiredArtifacts: ['IMPLEMENTATION_NOTES.md']
  },
  reviewer: {
    role: 'reviewer',
    displayName: 'Reviewer',
    expectedWrites: 'artifacts',
    requiredArtifacts: ['REVIEW.md']
  },
  tester: {
    role: 'tester',
    displayName: 'Tester',
    expectedWrites: 'artifacts',
    requiredArtifacts: ['TEST_REPORT.md']
  }
};
