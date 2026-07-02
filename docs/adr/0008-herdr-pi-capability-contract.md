# Herdr and Pi capability contract

pi-herd depends on verified Herdr 0.7.1 and Pi 0.80.2 command shapes for its first implementation slices.
Herdr provides the required workspace, worktree, pane, agent, wait, and integration surfaces, while Pi provides the required provider, model, thinking, session, and tool launch flags.
This is a point-in-time contract that should be rechecked when either Herdr or Pi changes command behavior.
We chose to document this as a discovery ADR because prompt sending and worker completion depend on subtle behavior: Herdr agent send writes literal text without Enter, pane send-text plus send-keys Enter submits prompts, Herdr `done` is listed in wait help but was not observed in the live probe, and Herdr activity state is only an input to pi-herd completion rather than completion by itself.
H1 applies this contract through shared Herdr command wrappers, pane metadata parsing, saved-pane validation before send, idle readiness waits before first prompt delivery, and warning-only fallback when readiness cannot be confirmed.
H2 treats current-pane verification as best-effort run targeting: command failures or unparseable pane metadata behave like an unbound current pane and preserve the single-active-run fallback.
Slice 6 probes `pane get` before reading activity, treats clear missing-pane failures as stopped, and treats ambiguous pane validation or unsupported status waits as unknown activity.
Slice 6 checks Herdr `done`, `blocked`, `idle`, and `working` as activity signals, but still requires required artifacts to be present and non-empty before a role can evaluate to `done`.
Current prompt delivery deliberately sends multi-line prompts as one `pane send-text` payload plus Enter until a later live probe justifies a different shape.
