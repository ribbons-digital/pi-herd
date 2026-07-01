# Lazy reviewer and tester worktree materialization

Reviewer and tester source views are isolated from the implementer worktree, but they are materialized lazily when those roles are activated or refreshed.
We chose this to preserve Codex-like worktree isolation while avoiding unnecessary worktree creation for staged roles that may never run.
