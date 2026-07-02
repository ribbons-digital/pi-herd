# Worker status model

Worker completion is based on both harness activity and artifact completion.
A raw idle or stopped signal from the harness is not stored as the final orchestration status by itself.
H1 readiness waits use Herdr idle only as a pre-send readiness signal, not as completion.
Sending a prompt marks the targeted role `working`, but message delivery alone does not imply later completion.
Slice 5 lead collection and brief commands report artifact inventory without marking workers `done` or `incomplete`.
We chose this because a worker that stops without producing the required artifact is incomplete, not done.
