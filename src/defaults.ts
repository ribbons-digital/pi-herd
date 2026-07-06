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

export type RoleName = string;
export type BuiltInRole = 'planner' | 'implementer' | 'reviewer' | 'tester';
export type ExpectedWrites = 'none' | 'artifacts' | 'worktree';

export interface RoleDefinition {
  display_name: string;
  expected_writes: ExpectedWrites;
  required_artifacts: string[];
}

export interface RoleDefault {
  role: BuiltInRole;
  displayName: string;
  expectedWrites: ExpectedWrites;
  requiredArtifacts: string[];
}

export const BUILT_IN_ROLE_ORDER: BuiltInRole[] = ['planner', 'implementer', 'reviewer', 'tester'];

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

export const DEFAULT_ROLE_REGISTRY = {
  default: [...BUILT_IN_ROLE_ORDER] as RoleName[],
  definitions: Object.fromEntries(
    Object.entries(ROLE_DEFAULTS).map(([role, defaults]) => [
      role,
      {
        display_name: defaults.displayName,
        expected_writes: defaults.expectedWrites,
        required_artifacts: [...defaults.requiredArtifacts]
      }
    ])
  ) as Record<RoleName, RoleDefinition>
};
