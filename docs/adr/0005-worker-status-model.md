# Worker status model

Worker completion is based on both harness activity and artifact completion.
A raw idle or stopped signal from the harness is not stored as the final orchestration status by itself.
H1 readiness waits use Herdr idle only as a pre-send readiness signal, not as completion.
Sending a prompt marks the targeted role `working`, but message delivery alone does not imply later completion.
Slice 5 lead collection and brief commands report artifact inventory without marking workers `done` or `incomplete`.
Slice 6 adds top-level `status`, `wait`, and `collect` commands that evaluate worker activity against required artifact validity.
`status` is read-only.
`wait` persists resolved role verdicts for working or blocked roles, but it keeps polling when a stored blocked role reports working again.
`collect` persists role verdicts, saves bounded pane logs, and writes `FINAL_SUMMARY.md` without marking the run lifecycle completed or abandoned.
A missing pane is treated as stopped only when Herdr clearly reports that the saved pane no longer exists.
An unknown activity signal never becomes `done`, even when artifacts are present.
We chose this because a worker that stops without producing the required artifact is incomplete, not done.
