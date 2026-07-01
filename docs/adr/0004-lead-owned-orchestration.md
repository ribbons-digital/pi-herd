# Lead-owned orchestration

Each run has one lead session that owns coordination and final decisions.
Workers do not directly orchestrate other workers by default and instead leave requests through artifacts or the lead inbox.
We chose this because visible multi-agent work can become confusing if workers message each other freely without the lead and user seeing a clear decision path.
