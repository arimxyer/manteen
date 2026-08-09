import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { mergeFile } from "../src/plan/merge-file";
import {
  classifyTypeScriptMerge,
  mergeTypeScriptExactly,
  type TypeScriptMergeInput,
  type TypeScriptMergeReasonCode,
} from "../src/plan/merge-typescript";

const BASE = [
  'import { A } from "a";',
  'import { B } from "b";',
  "export interface Props {",
  "  value: string;",
  "}",
  "export function View(props: Props) {",
  "  return props.value;",
  "}",
  "",
].join("\n");

function expectRefusal(
  local: string,
  incoming: string,
  options: { crossFile?: boolean; reason: TypeScriptMergeReasonCode },
): void {
  const result = mergeExact({
    base: BASE,
    local,
    incoming,
    crossFile: options.crossFile,
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.classification.reasons.map((reason) => reason.code)).toContain(options.reason);
}

type ExactInput = Omit<TypeScriptMergeInput, "sourcePath"> & { sourcePath?: string };

function mergeExact(input: ExactInput) {
  return mergeTypeScriptExactly({ ...input, sourcePath: input.sourcePath ?? "fixture.tsx" });
}

function classifyExact(input: ExactInput) {
  return classifyTypeScriptMerge({ ...input, sourcePath: input.sourcePath ?? "fixture.tsx" });
}

describe("exact-source AST merge", () => {
  test("combines distinct unique anchors without printing either side", () => {
    const local = BASE.replace('{ B } from "b"', '{ B, LocalB } from "b"');
    const incoming = BASE.replace('{ A } from "a"', '{ A, IncomingA } from "a"');
    const result = mergeExact({ base: BASE, local, incoming });

    expect(result).toMatchObject({
      ok: true,
      classification: {
        decision: "independent-candidate",
        local: { keys: ["ImportDeclaration:b"] },
        incoming: { keys: ["ImportDeclaration:a"] },
      },
      proof: {
        localReconstructedExactly: true,
        incomingReconstructedExactly: true,
        mergedParses: true,
      },
    });
    if (!result.ok) return;
    expect(result.content).toBe(
      BASE.replace('{ A } from "a"', '{ A, IncomingA } from "a"').replace(
        '{ B } from "b"',
        '{ B, LocalB } from "b"',
      ),
    );
  });

  test("is symmetric when local and incoming exchange roles", () => {
    const local = BASE.replace('{ B } from "b"', '{ B, LocalB } from "b"');
    const incoming = BASE.replace("value: string", "value: string | number");
    const forward = mergeExact({ base: BASE, local, incoming });
    const reverse = mergeExact({ base: BASE, local: incoming, incoming: local });

    expect(forward.ok).toBe(true);
    expect(reverse.ok).toBe(true);
    if (!forward.ok || !reverse.ok) return;
    expect(forward.content).toBe(reverse.content);
  });

  test("rescues five distinct adjacent-anchor conflict shapes", () => {
    const cases = [
      {
        id: "adjacent-imports",
        base: 'import { A } from "a";\nimport { B } from "b";\nexport const value = 1;\n',
        local: 'import { A, LocalA } from "a";\nimport { B } from "b";\nexport const value = 1;\n',
        incoming:
          'import { A } from "a";\nimport { B, IncomingB } from "b";\nexport const value = 1;\n',
      },
      {
        id: "adjacent-interfaces",
        base: "export interface A { value: string }\nexport interface B { count: number }\n",
        local:
          "export interface A { value: string; local?: boolean }\nexport interface B { count: number }\n",
        incoming:
          "export interface A { value: string }\nexport interface B { count: number; incoming?: boolean }\n",
      },
      {
        id: "adjacent-functions",
        base: "export function A() { return 1 }\nexport function B() { return 2 }\n",
        local: "export function A() { return 10 }\nexport function B() { return 2 }\n",
        incoming: "export function A() { return 1 }\nexport function B() { return 20 }\n",
      },
      {
        id: "interface-then-function",
        base: "export interface Props { value: string }\nexport function View(props: Props) { return props.value }\n",
        local:
          "export interface Props { value: string; local?: boolean }\nexport function View(props: Props) { return props.value }\n",
        incoming:
          "export interface Props { value: string }\nexport function View(props: Props) { return String(props.value) }\n",
      },
      {
        id: "variable-then-function",
        base: "export const options = { value: 1 };\nexport function View() { return options.value }\n",
        local:
          "export const options = { value: 2 };\nexport function View() { return options.value }\n",
        incoming:
          "export const options = { value: 1 };\nexport function View() { return String(options.value) }\n",
      },
    ];

    for (const entry of cases) {
      expect(mergeFile(entry.local, entry.base, entry.incoming).ok, entry.id).toBe(false);
      const exact = mergeExact(entry);
      expect(exact.ok, entry.id).toBe(true);
      if (!exact.ok) continue;
      expect(exact.proof, entry.id).toEqual({
        localReconstructedExactly: true,
        incomingReconstructedExactly: true,
        mergedParses: true,
      });
    }
  });

  test("preserves BOM, CRLF, comments, formatting and final newline exactly", () => {
    const base =
      '\uFEFF/* lead */\r\nimport{A}from"a";\r\nimport { B } from "b"; // keep\r\nexport const value={ deep: true };\r\n';
    const local = base.replace('{ B } from "b"', '{ B, LocalB } from "b"');
    const incoming = base.replace("{ deep: true }", "{ deep: false }");
    const expected = base
      .replace('{ B } from "b"', '{ B, LocalB } from "b"')
      .replace("{ deep: true }", "{ deep: false }");
    const result = mergeExact({ base, local, incoming });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe(expected);
    expect(result.content.startsWith("\uFEFF")).toBe(true);
    expect(result.content.endsWith("\r\n")).toBe(true);
    expect(result.content).toContain("; // keep\r\n");
  });

  test("accepts a nested edit only as ownership of its whole top-level declaration", () => {
    const local = BASE.replace("return props.value", "return props.value.toUpperCase()");
    const incoming = BASE.replace('{ A } from "a"', '{ A, IncomingA } from "a"');
    const result = mergeExact({ base: BASE, local, incoming });

    expect(result).toMatchObject({
      ok: true,
      classification: {
        local: { keys: ["FunctionDeclaration:View"] },
        incoming: { keys: ["ImportDeclaration:a"] },
      },
    });
  });

  test("does not let unrelated duplicate keys poison unique anchors", () => {
    const base = `import { D1 } from "dup";\nimport { D2 } from "dup";\n${BASE}`;
    const local = base.replace('{ B } from "b"', '{ B, LocalB } from "b"');
    const incoming = base.replace('{ A } from "a"', '{ A, IncomingA } from "a"');
    const result = mergeExact({ base, local, incoming });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.match(/from "dup"/g)).toHaveLength(2);
  });

  test("refuses two edits to the same structural key", () => {
    expectRefusal(
      BASE.replace("value: string", "value: string | number"),
      BASE.replace("value: string", "value: string | null"),
      { reason: "same-key-change" },
    );
  });

  test("refuses disjoint-looking edits inside the same top-level function", () => {
    expectRefusal(
      BASE.replace("return props.value", "const local = true;\n  return props.value"),
      BASE.replace("return props.value", "return String(props.value)"),
      { reason: "same-key-change" },
    );
  });

  test("refuses renamed, kind-changed, added and deleted anchors", () => {
    const incoming = BASE.replace('{ A } from "a"', '{ A, IncomingA } from "a"');
    const cases = [
      BASE.replace("function View", "function RenamedView"),
      BASE.replace(
        "export function View(props: Props) {\n  return props.value;\n}",
        "export const View = (props: Props) => props.value;",
      ),
      `${BASE}export default function Added() {}\n`,
      BASE.replace('import { B } from "b";\n', ""),
    ];

    for (const local of cases) {
      expectRefusal(local, incoming, { reason: "reconstruction-mismatch" });
    }
  });

  test("refuses changed duplicate anchors and changes in unowned trivia", () => {
    const incoming = BASE.replace("value: string", "value: string | number");
    expectRefusal(
      BASE.replace('import { A } from "a";', 'import { A } from "a";\nimport { A2 } from "a";'),
      incoming,
      { reason: "reconstruction-mismatch" },
    );
    expectRefusal(BASE.replace("import { B }", "// local gap\nimport { B }"), incoming, {
      reason: "reconstruction-mismatch",
    });
    expectRefusal(`${BASE}// local trailing trivia\n`, incoming, {
      reason: "reconstruction-mismatch",
    });
  });

  test("refuses parse uncertainty and cross-file scope", () => {
    const incoming = BASE.replace("value: string", "value: string | number");
    expectRefusal(BASE.replace('from "b"', 'from "b'), incoming, { reason: "parse-uncertain" });
    expectRefusal(BASE.replace('{ B } from "b"', '{ B, LocalB } from "b"'), incoming, {
      crossFile: true,
      reason: "cross-file-change",
    });
  });

  test("turns the historical adjacent-import witness into exact preserved output", () => {
    const root = resolve(import.meta.dirname, "fixtures", "ast-merge-corpus");
    const base = readFileSync(resolve(root, "revisions/cards-carousel-330968a.tsx.txt"), "utf8");
    const local = readFileSync(resolve(root, "locals/local-adjacent-import.tsx.txt"), "utf8");
    const incoming = readFileSync(
      resolve(root, "revisions/cards-carousel-689a314.tsx.txt"),
      "utf8",
    );
    const input = {
      sourcePath: "registry/mantine-ui/cards-carousel/cards-carousel.tsx",
      base,
      local,
      incoming,
    };
    const classification = classifyExact(input);
    const result = mergeExact(input);

    expect(classification.decision).toBe("independent-candidate");
    expect(classification.local.keys).toEqual(["ImportDeclaration:@mantine/core"]);
    expect(classification.incoming.keys).toContain("ImportDeclaration:@mantine/carousel");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("ActionIcon");
    expect(result.content).toContain("CarouselProps");
    expect(result.content).not.toContain("<<<<<<<");
  });

  test("parses .ts generic-arrow syntax as TypeScript rather than TSX", () => {
    const base = "export const identity = <T>(value: T) => value;\nexport const count = 1;\n";
    const local = base.replace("=> value", "=> ({ value })");
    const incoming = base.replace("count = 1", "count = 2");
    const result = mergeExact({ sourcePath: "generic.ts", base, local, incoming });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("=> ({ value })");
    expect(result.content).toContain("count = 2");
  });
});
