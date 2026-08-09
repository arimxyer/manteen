# AST-assisted merge classification spike

Status: **complete as an evidence-only precursor.** This experiment added no CLI flag, public API,
AST printer or merge output. The later exact-splice integration is separately frozen, accepted and
public in client `0.5.0`; see
[`ast-merge-integration-decision.md`](ast-merge-integration-decision.md).

## Question and stopping condition

Can a read-only TypeScript AST conservatively identify structurally independent local/upstream
edits that current diff3 reports as a conflict, without ever labeling a reviewed ambiguous case
independent?

The positive stopping condition was both: zero false-independent classifications and at least one
real-upstream plus controlled-local case where diff3 conflicts but structural classification finds
distinct unique keys. The negative stop was any false-independent result, parse uncertainty treated
as safe, or no rescued conflict.

## Corpus and method

The committed corpus contains 2 real upstream pairs for
`registry/mantine-ui/cards-carousel/cards-carousel.tsx` across 9 cases. The base and
incoming bytes are copied from the named Git revisions. Every local adaptation is explicitly
synthetic and controlled; this is not observed consumer telemetry and supports no conflict-rate
claim.

The classifier parses read-only with ts-morph, computes exact original-string change offsets,
keys imports by module specifier, and keys uniquely named exported top-level declarations by syntax
kind plus name. Only changes that map uniquely to stable keys on both sides, with disjoint local and
incoming key sets, become `independent-candidate`. Parse uncertainty, unmatched/default/internal
changes, duplicate keys, declaration-kind changes, same-key changes and cross-file scope all refuse.
It returns no merged content and invokes no AST printer.

The baseline for every case is the production `mergeFile()` diff3 implementation.

Reproduce the machine report with `bun packages/cli/test/ast-merge-report.ts`, the Markdown with
the same command plus `--markdown`, and the assertions with
`bun test packages/cli/test/ast-merge-classification.test.ts`.

## Results

| Case | diff3 | AST classification | Reviewed assessment | Value over baseline |
| --- | --- | --- | --- | --- |
| adjacent-distinct-imports | conflict | independent-candidate | true-independent | yes |
| disjoint-exported-declarations | merged | independent-candidate | true-independent | no |
| same-exported-declaration | conflict | must-refuse | correct-refusal | no |
| declaration-kind-change | merged | must-refuse | correct-refusal | no |
| unexported-rename-versus-edit | conflict | must-refuse | correct-refusal | no |
| local-parse-error | conflict | must-refuse | correct-refusal | no |
| anonymous-default-addition | merged | must-refuse | correct-refusal | no |
| duplicate-import-key | conflict | must-refuse | correct-refusal | no |
| cross-file-local-adaptation | merged | must-refuse | correct-refusal | no |

Summary: 5 diff3 conflicts, 2
independent candidates, 7 conservative refusals,
1 rescued conflict, 0
false-independent results and 0 false refusals.

## Repository acceptance

On 2026-08-08, the repository acceptance path passed with 304 source tests, zero failures,
typecheck/Astro check, a 32-page site build carrying all 22 registry items, Biome, all five guards,
the rebuilt client bundle, and 128 real-Node e2e passes with one explicitly opt-in packed-consumer
smoke skipped. The corpus/report equality test is part of that source suite.

## Conclusion

The stopping condition passed:
`narrow-classification-value-demonstrated`. The adjacent-import case demonstrates a narrow real value: the
historical upstream edit changed `@mantine/carousel` while a controlled local adaptation changed
the adjacent `@mantine/core` import. Line diff3 conflicts because the lines are adjacent; the
read-only classifier identifies distinct unique import keys.

That does **not** prove an AST merger, an output algorithm, or a population conflict rate. The
corpus has one source path and synthetic local sides. It also does not show that every structural
candidate can be combined while preserving comments, byte order, CRLF/BOM state, TypeScript
semantics or cross-file intent.

The spike's recommendation at this evidence boundary was therefore
`retain-line-merge-no-integration`; D41 remained unchanged at that point. The later integration
proposal supplied a separate exact-output contract, broader history/adversarial coverage, and
source, built-Node, hosted and controlled public-consumer proof before shipping in `0.5.0`. That
later result does not widen what this smaller spike itself proved.
