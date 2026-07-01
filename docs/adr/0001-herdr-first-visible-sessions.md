# Herdr-first visible sessions over hidden subagents

pi-herd is built around visible Herdr panes running normal harness sessions instead of hidden subagents inside one parent process.
We chose this because the product goal is steerable, inspectable, isolated work that users can interrupt and resume directly.
Hidden subagent runtimes were rejected because they obscure worker state and make coordination depend on one session summarizing another.
