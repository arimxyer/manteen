# Apply scope

`apply()` executes an accepted registry `Plan`. It does not re-decide product policy. The order is
load-bearing:

```text
0  preflight      read-only; re-prove paths and preimage hashes
1  decide         read-only; collect the one grouped overwrite decision
2  dependencies   outside the journal
3  files          journaled
4  theme          journaled
5  managed styles journaled
6  pristine bases journaled
7  receipt        journaled and last durable ownership write
8  verification   before journal release; failure unwinds Manteen-managed preimages
```

## Invariants

- Every decision precedes every mutation. Cancellation is zero-mutation, and dry-run stops after
  the read-only proofs without requiring a terminal or install port.
- Dependency installation is deliberately outside rollback. A package manager is not
  transactional, so failures report possible dependency side effects without claiming to undo
  them.
- Components, theme, managed styles, pristine bases, and receipt share one preimage journal.
- The receipt is the final ownership mutation. Never leave a new base paired with an old receipt,
  or a receipt claiming bytes that were skipped or rolled back.
- Project verification runs before releasing the journal. Failure restores captured Manteen-owned
  and control preimages; it does not claim to restore arbitrary effects created by the verifier.
- The journal captures a preimage before attempting a write. `unrestored` means the preimage could
  not be proven restored, not that Manteen's attempted bytes are definitely present.
- Failed or rolled-back outcomes report `files: []`; phase-one decisions are not observations of
  durable writes.
- The overwrite prompt remains an injected port, selects nothing by default, and is never reached
  by dry-run.
