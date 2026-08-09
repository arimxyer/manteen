# AST-assisted merge integration decision

Status: **implemented; unreleased.** The exact source-splice merger is now an automatic
TypeScript-only fallback after the existing line diff3 merger reports a conflict. It is shared by
`diff` and `update`; there is no flag and clean line merges pay no AST cost. This does not support
an AST printer, an AST-first merger, or a semantic-safety claim.

## Decision

The implementation keeps this frozen boundary:

1. Run the current exact line-oriented `mergeFile()` first. A clean result returns unchanged and
   pays no AST cost.
2. Only a remaining conflict for registry source identified as `.ts` or `.tsx` may enter the AST
   fallback.
3. Parse base, local and incoming read-only. Imports are keyed by module specifier. Uniquely named,
   exported top-level declarations are keyed by syntax kind plus name.
4. A side is eligible only when replacing whole unique base anchors with exact slices from that
   side reconstructs the complete side byte-for-byte. This proof owns all output trivia: no AST
   printer or formatter emits bytes.
5. Local and incoming changed-key sets must be disjoint. Combine their exact slices against the
   base, require non-overlapping ranges, and require the result to parse.
6. Parse uncertainty, same-key edits, added/deleted/renamed/kind-changed anchors, changed duplicate
   keys, anonymous/default/internal-only changes, unowned trivia and explicitly cross-file scope
   refuse. The original diff3 conflict remains the user-visible result.
7. A successful result remains only **conflict-free text**. It is not semantically safe; D40's
   project-owned verification remains the opt-in behavioral check.

The owner confirmed there are no users to preserve or mine for an independently authored local
adaptation corpus. Compatibility and adoption are therefore not decision gates. Historical inputs
and constructed inputs remain labeled separately below.

## Gate results

| Gate | Threshold | Result | Verdict |
| --- | --- | --- | --- |
| Exact output | Reconstruct both sides byte-for-byte; no printer | Every accepted case proves exact reconstruction; BOM, CRLF, comments, formatting and final newline are covered | pass |
| Safety | Zero authorizations for reviewed ambiguous cases | 0 across same-key, unanchored and dedicated refusal cases | pass |
| Symmetry | Swapping local/incoming produces the same accepted bytes | 0 asymmetric results across the history matrix; dedicated assertion passes | pass |
| Historical breadth | Evaluate every eligible TS/TSX registry modification in repository history | 25 file events, 17 paths, 9 commits | pass |
| Historical utility | Demonstrate at least one real-upstream diff3 conflict rescue | One historical event on `cards-carousel.tsx`; two controlled boundary variants | pass, narrow |
| Structural utility | Rescue at least three distinct adjacent-anchor conflict shapes | Five: import/import, interface/interface, function/function, interface/function and variable/function | pass |
| Runtime | Successful candidate p95 at or below 250 ms, excluding source I/O | 167–177 ms p95 across implementation-verification runs | pass |
| Dependency | No new shipped parser dependency | `ts-morph` is already a CLI runtime dependency and already externalized by the built bundle | pass |
| Integration | Source plan/diff and built-Node CLI acceptance | Both commands report the same automatic rescue; update writes both exact edits and advances the pristine base to upstream | pass |
| Bundle | Measure the built merge chunk | +9.95 kB raw / +2.67 kB gzip; no new dependency | pass |

## Historical experiment

`bun packages/cli/test/ast-merge-integration-probe.ts` walks nine named commit/base pairs covering
all 25 eligible modified TS/TSX file events and 17 source paths in current repository history. The
incoming sides are exact Git objects. Local sides are constructed mutations inside stable anchors;
they are not consumer evidence.

The exact classifier can fully map 9 of the 25 upstream events. The other 16 refuse because exact
whole-anchor reconstruction cannot account for every changed byte. Across the nine eligible events,
the boundary sweep generated 76 reviewed disjoint cases and 24 same-key cases, plus one unanchored
edit for each history event. Results:

- 2 production diff3 conflicts, both controlled boundary variants of the same historical adjacent
  import event;
- 2 exact rescues on that one source path;
- 0 false authorizations;
- 0 false refusals among reviewed disjoint cases;
- 0 asymmetric accepted results.

This proves one repository-real opportunity and broad fail-closed behavior. It does not estimate a
future user conflict rate.

## Constructed structural and adversarial experiment

`bun test packages/cli/test/ast-merge-exact-prototype.test.ts` freezes 13 tests and 60 assertions.
Five separate one-file structures intentionally make line diff3 conflict across adjacent top-level
anchors; the production exact merger combines all five. The suite also proves:

- exact merged bytes and local/incoming exchange symmetry;
- BOM, CRLF, comments, unusual formatting and final-newline preservation;
- whole-declaration ownership for nested edits;
- unrelated duplicate anchors do not poison unique anchors;
- same-key and same-function edits refuse;
- rename, declaration-kind change, add, delete and changed duplicate anchors refuse;
- leading/trailing unowned trivia, parse uncertainty and explicit cross-file scope refuse;
- the historical adjacent-import witness becomes exact source with both changes and no markers.

These are constructed engineering cases. They prove supported and refused shapes, not observed
frequency.

## Runtime experiment

`bun packages/cli/test/ast-merge-runtime-probe.ts` preloads source, performs three warmups and
records 20 calls per case. Git and filesystem I/O are outside the timed region. On the 2026-08-09
development machine:

| Case | Source size | Result | Median | p95 |
| --- | ---: | --- | ---: | ---: |
| Historical carousel conflict | 2.3 KiB base | exact merge | 159 ms | 169 ms |
| Historical data-table candidate | 3.4 KiB base | exact merge | 162 ms | 167 ms |
| Largest historical event | 6.4 KiB base | conservative refusal | 86 ms | 91 ms |

The line merger remains roughly 0.08–0.24 ms median in the same probe. This would be unacceptable
as an AST-first path, but is acceptable behind an already-reached conflict. A clean update pays no
AST parsing cost.

## What changed from the first spike

The first read-only classifier mapped line-diff spans onto AST anchors. It demonstrated a narrow
signal but deliberately could not emit output. The integrated implementation instead derives
changed keys from exact anchor slices and proves each complete side by reconstruction before
combining anything. That removes line-hunk boundary blindness and turns the output question into a
byte-equality proof rather than an AST-printing problem.

## Integration receipt — 2026-08-09

`packages/cli/src/plan/merge-typescript.ts` owns the read-only parsing, classification and exact
source reconstruction. `mergeFile()` still runs diff3 first and invokes it only for a remaining
`.ts`/`.tsx` conflict. Both plan/update and diff pass the registry source path into that shared
function. If the fallback refuses, the original diff3 conflict and its ranges remain unchanged.

Source tests cover the fallback boundary, exact output and plan/diff parity. The built-Node command
test runs the packaged CLI, makes distinct local and upstream changes to adjacent exported
declarations, proves `diff` reports `merged`, proves `update` writes both changes, and proves the
new pristine base contains upstream alone. The production build moved the merge-bearing chunk from
507.13 kB to 517.08 kB raw and from 150.18 kB to 152.85 kB gzip: +9.95 kB raw / +2.67 kB gzip.
No parser package was added.

This branch is not a release receipt. Public `manteen@0.4.0` remains line-diff3-only until this
candidate is reviewed, merged and published separately.
