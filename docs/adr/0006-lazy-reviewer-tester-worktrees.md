# Lazy reviewer and tester worktree materialization

Reviewer and tester source views are isolated from the implementer worktree, but they are materialized lazily when those roles are activated or refreshed.
`pi-herd run create --with-worktrees` materializes the implementer worktree and can also materialize the planner worktree with `--planner-worktree`.
`pi-herd start` materializes the implementer worktree when the implementer role is selected, and it can also materialize the planner worktree with `--planner-worktree`.
Role branch names and worktree paths are derived from `run_id`, not `run_slug`, so retained repeated-goal runs do not collide.
Reviewer and tester role records remain `worktree_status: pending` after run creation or launch.
The first `pi-herd send reviewer ...` or `pi-herd send tester ...` activation materializes the role worktree from the implementation branch before launching the role session, waiting briefly for idle readiness, and sending the prompt.
`pi-herd refresh reviewer` and `pi-herd refresh tester` materialize pending role worktrees, recreate missing stored role worktrees when their branches still exist, or reset existing role worktrees to the implementation branch between passes.
Refresh refuses dirty paths, committed role-branch changes, unexpected paths, wrong branches, and working roles unless `--force` is passed.
Forced refresh saves a backup ref, stashes dirty work when needed, resets the role worktree to the implementation branch, and cleans untracked files.
`pi-herd cleanup --remove-worktrees` removes role worktrees only when explicitly requested, refuses dirty or working roles unless forced, and preserves branch refs rather than deleting role branches.
We chose this to preserve Codex-like worktree isolation while avoiding unnecessary worktree creation for staged roles that may never run.
