import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { classifyAstMerge } from "./support/ast-merge-classifier";
import {
  AST_CORPUS_ROOT,
  evaluateAstMergeCorpus,
  renderAstMergeSpikeMarkdown,
} from "./support/ast-merge-corpus";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("D41 evidence-only AST merge classification", () => {
  test("the committed corpus has zero false-independent results and one rescued diff3 conflict", () => {
    const report = evaluateAstMergeCorpus();
    expect(report.summary).toMatchObject({
      rescuedConflicts: 1,
      falseIndependent: 0,
      falseRefusal: 0,
      stoppingConditionSatisfied: true,
      conclusion: "narrow-classification-value-demonstrated",
      productionRecommendation: "retain-line-merge-no-integration",
    });

    const witness = report.cases.find((entry) => entry.id === "adjacent-distinct-imports");
    expect(witness).toMatchObject({
      baseline: { decision: "conflict" },
      ast: { decision: "independent-candidate" },
      assessment: "true-independent",
      demonstratesValueOverBaseline: true,
    });
  }, 15_000);

  test("classification is read-only and exposes no merged source", () => {
    const base = readFileSync(
      resolve(AST_CORPUS_ROOT, "revisions/cards-carousel-330968a.tsx.txt"),
      "utf8",
    );
    const local = readFileSync(
      resolve(AST_CORPUS_ROOT, "locals/local-adjacent-import.tsx.txt"),
      "utf8",
    );
    const incoming = readFileSync(
      resolve(AST_CORPUS_ROOT, "revisions/cards-carousel-689a314.tsx.txt"),
      "utf8",
    );
    const before = { base, local, incoming };
    const result = classifyAstMerge({ base, local, incoming });

    expect({ base, local, incoming }).toEqual(before);
    expect(result.decision).toBe("independent-candidate");
    expect("content" in result).toBe(false);
  });

  test("read-only classification preserves BOM, CRLF and final-newline input bytes", () => {
    const base =
      '\uFEFFimport { A } from "a";\r\nimport { B } from "b";\r\nexport const value = 1;\r\n';
    const local = base.replace("{ B }", "{ B, LocalB }");
    const incoming = base.replace("{ A }", "{ A, IncomingA }");
    const before = { base, local, incoming };

    const result = classifyAstMerge({ base, local, incoming });

    expect(result).toMatchObject({
      decision: "independent-candidate",
      local: { keys: ["ImportDeclaration:b"] },
      incoming: { keys: ["ImportDeclaration:a"] },
    });
    expect({ base, local, incoming }).toEqual(before);
    expect(base.startsWith("\uFEFF")).toBe(true);
    expect(base.endsWith("\r\n")).toBe(true);
  });

  test("machine and human reports are exact products of the committed corpus", () => {
    const report = evaluateAstMergeCorpus();
    expect(
      JSON.parse(readFileSync(resolve(REPO_ROOT, "docs/ast-assisted-merge-spike.json"), "utf8")),
    ).toEqual(report);
    expect(readFileSync(resolve(REPO_ROOT, "docs/ast-assisted-merge-spike.md"), "utf8")).toBe(
      renderAstMergeSpikeMarkdown(report),
    );
  });
});
