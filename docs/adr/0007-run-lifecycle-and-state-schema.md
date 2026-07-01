# Run lifecycle and state schema

Each run has a lifecycle status and a canonical `state.json` under its run directory.
Active-run resolution only considers active runs unless the user explicitly selects another run.
We chose this because pi-herd must support multiple parallel runs without guessing the target when commands omit `--run`.
