# Pi-first but harness-neutral model

pi-herd ships first for Pi, but its core language uses harness-neutral concepts such as harness, lead session, and worker session.
We chose this because the product name and first integration are Pi-specific while the long-term orchestration model should support other coding-agent harnesses.
This avoids locking state, config, and role language to Pi-only assumptions.
