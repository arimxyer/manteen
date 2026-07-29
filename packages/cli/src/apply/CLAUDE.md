# apply/ — six phases, in this order

`apply()` executes a `Plan`. It adds no decisions of its own. The ordering is the design, not an
implementation detail:

```
        returns immediately if !plan.ok
0  preflight     read-only  — re-verify the hashes plan gated on
1  decide        read-only  — the ONE question a human may be asked
   ── cancel returns here: nothing installed, nothing journalled, nothing written ──
2  deps                     — install npm dependencies
3  write files              — temp + rename, through the journal
4  write theme              — fold, not overwrite
5  write receipt            — manteen.lock.json
```

**Every decision sits above every mutation.** That is what makes cancelling zero-mutation: at
phase 1 no dependency has been installed, no journal opened, no receipt touched. Moving the
prompt below phase 2 would silently cost that property. (D18.)

## Files

| File | Role |
| --- | --- |
| `index.ts` | The phase sequence, the failure returns, rollback. |
| `preflight.ts` | Phase 0. Uniqueness, containment, hash re-verification. |
| `decide.ts` | Phase 1. `Disposition` → `WriteResult`, and the overwrite prompt behind an injected port. |
| `install-deps.ts` | Phase 2. nypm. The only place a package manager is spawned. |
| `journal.ts` | Pre-image record backing rollback. |
| `write-files.ts` / `write-theme.ts` | Phases 3 and 4. |

## Invariants

**The prompt is an injected port.** That is why phases 2–5 are testable at all — driving clack
needs a pty. Keep it injected; do not import clack into the phase logic.

**Nothing is pre-selected in the overwrite prompt.** The two defaults are not symmetric: with
nothing selected a reflexive Enter keeps every file (a no-op, redoable with `--overwrite`); with
everything selected the same keystroke destroys files manteen never wrote, unrecoverably for
anything not in git.

**`--dry-run` must not need a terminal or a port.** Its branch in `decide.ts` sits *above* both
wiring assertions. A dry run that renders a prompt hangs forever in CI — that shipped once.

**A failed run reports `files: []`.** All three failure returns clear the file list. Reporting
phase 1's decisions after a failure prints `written` beside files that were never written.

**The journal records a file BEFORE the write is attempted.** So `unrestored` means "could not
prove the pre-image is back", not "we wrote it" — a write that failed outright still appears
there. Failure paths go to stderr, which is the only channel that can honestly say
"indeterminate".

**The tripwires in `decide.ts` are unreachable by design.** `nonInteractiveMessage` and
`missingPortMessage` fire only if `plan()`'s gate did not run. Their text is addressed to whoever
broke the wiring, not to a user — no help text applies. They exist so that a bug becomes a loud
stop at phase 1 instead of silently overwriting someone's edits at phase 3.
