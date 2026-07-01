# Lazy reviewer and tester worktree materialization

Reviewer and tester source views are isolated from the implementer worktree, but they are materialized lazily when those roles are activated or refreshed.
Slice 3 materializes the implementer worktree when `pi-herd run create --with-worktrees` is passed and can also materialize the planner worktree with `--planner-worktree`.
Role branch names and worktree paths are derived from `run_id`, not `run_slug`, so retained repeated-goal runs do not collide.
Reviewer and tester role records remain `worktree_status: pending` after run creation.
We chose this to preserve Codex-like worktree isolation while avoiding unnecessary worktree creation for staged roles that may never run.
