# Worker status model

Worker completion is based on both harness activity and artifact completion.
A raw idle or stopped signal from the harness is not stored as the final orchestration status by itself.
We chose this because a worker that stops without producing the required artifact is incomplete, not done.
