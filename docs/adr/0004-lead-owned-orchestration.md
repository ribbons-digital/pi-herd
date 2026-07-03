# Lead-owned orchestration

Each run has one lead session that owns coordination and final decisions.
Workers do not directly orchestrate other workers by default and instead leave requests through artifacts or the lead inbox.
`pi-herd lead send` requires the command to run from the verified bound Pi lead pane before forwarding work to a role.
Plain `pi-herd send` remains available as an explicit operator command for worker messaging.
`pi-herd lead collect` remains a read-only lead inventory helper, while top-level `pi-herd collect` generates `FINAL_SUMMARY.md` without closing the run lifecycle.
`pi-herd cleanup --close-panes` can close worker panes, but it never closes the lead pane because the lead owns final acceptance and cleanup decisions.
We chose this because visible multi-agent work can become confusing if workers message each other freely without the lead and user seeing a clear decision path.
