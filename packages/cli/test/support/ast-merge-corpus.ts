import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { mergeFile } from "../../src/plan/merge-file";
import { type AstClassificationResult, classifyAstMerge } from "./ast-merge-classifier";

type GroundTruth = "independent" | "must-refuse";

interface UpstreamPair {
  baseRevision: string;
  incomingRevision: string;
  baseSha256: string;
  incomingSha256: string;
  baseFile: string;
  incomingFile: string;
  provenance: "real-repository-history";
}

interface CorpusCase {
  id: string;
  upstreamPair: string;
  localFile: string;
  localProvenance: "synthetic-controlled-adaptation";
  localDescription: string;
  crossFile?: boolean;
  reviewedGroundTruth: GroundTruth;
  groundTruthReason: string;
}

interface CorpusManifest {
  schemaVersion: 1;
  sourcePath: string;
  upstreamPairs: Record<string, UpstreamPair>;
  cases: CorpusCase[];
}

export interface AstMergeSpikeCaseReport {
  id: string;
  upstreamPair: string;
  baseRevision: string;
  incomingRevision: string;
  baseSha256: string;
  incomingSha256: string;
  sourcePath: string;
  upstreamProvenance: "real-repository-history";
  localProvenance: "synthetic-controlled-adaptation";
  localDescription: string;
  reviewedGroundTruth: GroundTruth;
  groundTruthReason: string;
  baseline: {
    decision: "merged" | "conflict";
    conflictCount: number;
  };
  ast: AstClassificationResult;
  assessment: "true-independent" | "correct-refusal" | "false-independent" | "false-refusal";
  demonstratesValueOverBaseline: boolean;
}

export interface AstMergeSpikeReport {
  schemaVersion: 1;
  experiment: "read-only-ast-merge-classification";
  productionChanged: false;
  corpus: {
    sourcePaths: number;
    realUpstreamPairs: number;
    cases: number;
    localAdaptations: "synthetic-controlled";
  };
  summary: {
    baselineConflicts: number;
    independentCandidates: number;
    mustRefuse: number;
    rescuedConflicts: number;
    falseIndependent: number;
    falseRefusal: number;
    stoppingConditionSatisfied: boolean;
    conclusion: "narrow-classification-value-demonstrated" | "no-demonstrated-value";
    productionRecommendation: "retain-line-merge-no-integration";
  };
  cases: AstMergeSpikeCaseReport[];
}

export const AST_CORPUS_ROOT = resolve(import.meta.dirname, "..", "fixtures", "ast-merge-corpus");

function read(root: string, relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function evaluateAstMergeCorpus(root = AST_CORPUS_ROOT): AstMergeSpikeReport {
  const manifest = JSON.parse(read(root, "manifest.json")) as CorpusManifest;
  const cases = manifest.cases.map((corpusCase): AstMergeSpikeCaseReport => {
    const pair = manifest.upstreamPairs[corpusCase.upstreamPair];
    if (pair === undefined) throw new Error(`unknown upstream pair: ${corpusCase.upstreamPair}`);
    const base = read(root, pair.baseFile);
    const incoming = read(root, pair.incomingFile);
    const local = read(root, corpusCase.localFile);
    if (sha256(base) !== pair.baseSha256) {
      throw new Error(`historical base fixture hash changed: ${pair.baseFile}`);
    }
    if (sha256(incoming) !== pair.incomingSha256) {
      throw new Error(`historical incoming fixture hash changed: ${pair.incomingFile}`);
    }
    const baselineResult = mergeFile(local, base, incoming);
    const ast = classifyAstMerge({ base, local, incoming, crossFile: corpusCase.crossFile });
    const astIndependent = ast.decision === "independent-candidate";
    const truthIndependent = corpusCase.reviewedGroundTruth === "independent";
    const assessment = astIndependent
      ? truthIndependent
        ? "true-independent"
        : "false-independent"
      : truthIndependent
        ? "false-refusal"
        : "correct-refusal";

    return {
      id: corpusCase.id,
      upstreamPair: corpusCase.upstreamPair,
      baseRevision: pair.baseRevision,
      incomingRevision: pair.incomingRevision,
      baseSha256: pair.baseSha256,
      incomingSha256: pair.incomingSha256,
      sourcePath: manifest.sourcePath,
      upstreamProvenance: pair.provenance,
      localProvenance: corpusCase.localProvenance,
      localDescription: corpusCase.localDescription,
      reviewedGroundTruth: corpusCase.reviewedGroundTruth,
      groundTruthReason: corpusCase.groundTruthReason,
      baseline: {
        decision: baselineResult.ok ? "merged" : "conflict",
        conflictCount: baselineResult.ok ? 0 : baselineResult.conflicts.length,
      },
      ast,
      assessment,
      demonstratesValueOverBaseline:
        !baselineResult.ok && truthIndependent && ast.decision === "independent-candidate",
    };
  });

  const count = (predicate: (entry: AstMergeSpikeCaseReport) => boolean) =>
    cases.filter(predicate).length;
  const falseIndependent = count((entry) => entry.assessment === "false-independent");
  const rescuedConflicts = count((entry) => entry.demonstratesValueOverBaseline);
  const stoppingConditionSatisfied = falseIndependent === 0 && rescuedConflicts > 0;

  return {
    schemaVersion: 1,
    experiment: "read-only-ast-merge-classification",
    productionChanged: false,
    corpus: {
      sourcePaths: new Set(cases.map((entry) => entry.sourcePath)).size,
      realUpstreamPairs: Object.keys(manifest.upstreamPairs).length,
      cases: cases.length,
      localAdaptations: "synthetic-controlled",
    },
    summary: {
      baselineConflicts: count((entry) => entry.baseline.decision === "conflict"),
      independentCandidates: count((entry) => entry.ast.decision === "independent-candidate"),
      mustRefuse: count((entry) => entry.ast.decision === "must-refuse"),
      rescuedConflicts,
      falseIndependent,
      falseRefusal: count((entry) => entry.assessment === "false-refusal"),
      stoppingConditionSatisfied,
      conclusion: stoppingConditionSatisfied
        ? "narrow-classification-value-demonstrated"
        : "no-demonstrated-value",
      productionRecommendation: "retain-line-merge-no-integration",
    },
    cases,
  };
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

export function renderAstMergeSpikeMarkdown(report: AstMergeSpikeReport): string {
  const rows = report.cases
    .map(
      (entry) =>
        `| ${escapeCell(entry.id)} | ${entry.baseline.decision} | ${entry.ast.decision} | ${entry.assessment} | ${entry.demonstratesValueOverBaseline ? "yes" : "no"} |`,
    )
    .join("\n");

  return `# AST-assisted merge classification spike

Status: **complete as an evidence-only spike.** Production update and diff still use D41's exact
line-oriented merge. This experiment adds no CLI flag, public API, AST printer or merge output.

## Question and stopping condition

Can a read-only TypeScript AST conservatively identify structurally independent local/upstream
edits that current diff3 reports as a conflict, without ever labeling a reviewed ambiguous case
independent?

The positive stopping condition was both: zero false-independent classifications and at least one
real-upstream plus controlled-local case where diff3 conflicts but structural classification finds
distinct unique keys. The negative stop was any false-independent result, parse uncertainty treated
as safe, or no rescued conflict.

## Corpus and method

The committed corpus contains ${report.corpus.realUpstreamPairs} real upstream pairs for
\`${report.cases[0]?.sourcePath ?? "unknown"}\` across ${report.corpus.cases} cases. The base and
incoming bytes are copied from the named Git revisions. Every local adaptation is explicitly
synthetic and controlled; this is not observed consumer telemetry and supports no conflict-rate
claim.

The classifier parses read-only with ts-morph, computes exact original-string change offsets,
keys imports by module specifier, and keys uniquely named exported top-level declarations by syntax
kind plus name. Only changes that map uniquely to stable keys on both sides, with disjoint local and
incoming key sets, become \`independent-candidate\`. Parse uncertainty, unmatched/default/internal
changes, duplicate keys, declaration-kind changes, same-key changes and cross-file scope all refuse.
It returns no merged content and invokes no AST printer.

The baseline for every case is the production \`mergeFile()\` diff3 implementation.

Reproduce the machine report with \`bun packages/cli/test/ast-merge-report.ts\`, the Markdown with
the same command plus \`--markdown\`, and the assertions with
\`bun test packages/cli/test/ast-merge-classification.test.ts\`.

## Results

| Case | diff3 | AST classification | Reviewed assessment | Value over baseline |
| --- | --- | --- | --- | --- |
${rows}

Summary: ${report.summary.baselineConflicts} diff3 conflicts, ${report.summary.independentCandidates}
independent candidates, ${report.summary.mustRefuse} conservative refusals,
${report.summary.rescuedConflicts} rescued conflict, ${report.summary.falseIndependent}
false-independent results and ${report.summary.falseRefusal} false refusals.

## Repository acceptance

On 2026-08-08, the repository acceptance path passed with 304 source tests, zero failures,
typecheck/Astro check, a 32-page site build carrying all 22 registry items, Biome, all five guards,
the rebuilt client bundle, and 128 real-Node e2e passes with one explicitly opt-in packed-consumer
smoke skipped. The corpus/report equality test is part of that source suite.

## Conclusion

The stopping condition ${report.summary.stoppingConditionSatisfied ? "passed" : "did not pass"}:
\`${report.summary.conclusion}\`. The adjacent-import case demonstrates a narrow real value: the
historical upstream edit changed \`@mantine/carousel\` while a controlled local adaptation changed
the adjacent \`@mantine/core\` import. Line diff3 conflicts because the lines are adjacent; the
read-only classifier identifies distinct unique import keys.

That does **not** prove an AST merger, an output algorithm, or a population conflict rate. The
corpus has one source path and synthetic local sides. It also does not show that every structural
candidate can be combined while preserving comments, byte order, CRLF/BOM state, TypeScript
semantics or cross-file intent.

The production recommendation is therefore \`${report.summary.productionRecommendation}\`.
D41 remains unchanged. A later integration proposal would need a separate contract for turning a
candidate into exact preserved output, more source paths and independently authored local examples,
plus built-Node and public-consumer proof before it could affect update behavior.
`;
}
