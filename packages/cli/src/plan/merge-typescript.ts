/**
 * Exact-source TypeScript merge fallback for D41.
 *
 * The AST supplies identity and original-string ranges only. It never prints,
 * formats, or otherwise synthesizes source. A side is eligible only when its
 * whole unique-anchor replacements reconstruct that complete side exactly.
 */
import { extname } from "node:path";

import { Node, Project, ScriptKind, type SourceFile } from "ts-morph";

export type TypeScriptMergeReasonCode =
  | "unsupported-source"
  | "cross-file-change"
  | "parse-uncertain"
  | "reconstruction-mismatch"
  | "same-key-change";

export interface TypeScriptMergeReason {
  code: TypeScriptMergeReasonCode;
  side?: "local" | "incoming";
  keys?: string[];
}

export interface TypeScriptMergeRange {
  baseStart: number;
  baseEnd: number;
  variantStart: number;
  variantEnd: number;
}

export interface TypeScriptMergeSide {
  ranges: TypeScriptMergeRange[];
  keys: string[];
}

export interface TypeScriptMergeClassification {
  decision: "independent-candidate" | "must-refuse";
  local: TypeScriptMergeSide;
  incoming: TypeScriptMergeSide;
  reasons: TypeScriptMergeReason[];
}

export interface TypeScriptMergeInput {
  sourcePath: string;
  base: string;
  local: string;
  incoming: string;
  /** Explicit proof that this edit cannot be evaluated as one source file. */
  crossFile?: boolean;
}

export interface TypeScriptMergeAnchor {
  key: string;
  start: number;
  end: number;
  /** Test-probe boundaries; neither participates in production output. */
  firstTokenEnd: number;
  lastTokenStart: number;
}

export interface TypeScriptMergeSourceInspection {
  anchors: TypeScriptMergeAnchor[];
  parseUncertain: boolean;
  duplicateKeys: string[];
}

export interface TypeScriptMergeReplacement {
  key: string;
  side: "local" | "incoming";
  baseStart: number;
  baseEnd: number;
  text: string;
}

export type TypeScriptMergeResult =
  | {
      ok: false;
      refusal:
        | "unsupported-source"
        | "classification-refused"
        | "overlapping-base-ranges"
        | "merged-parse-uncertain";
      classification: TypeScriptMergeClassification;
    }
  | {
      ok: true;
      content: string;
      classification: TypeScriptMergeClassification;
      replacements: TypeScriptMergeReplacement[];
      proof: {
        localReconstructedExactly: true;
        incomingReconstructedExactly: true;
        mergedParses: true;
      };
    };

interface ParsedSource {
  anchors: TypeScriptMergeAnchor[];
  keyCounts: Map<string, number>;
  parseUncertain: boolean;
}

interface ExactSideAnalysis extends TypeScriptMergeSide {
  replacements: TypeScriptMergeReplacement[];
  reasons: TypeScriptMergeReason[];
}

interface ExactClassificationAnalysis {
  classification: TypeScriptMergeClassification;
  localReplacements: TypeScriptMergeReplacement[];
  incomingReplacements: TypeScriptMergeReplacement[];
}

const EMPTY_SIDE: TypeScriptMergeSide = { ranges: [], keys: [] };

export function isTypeScriptMergeSource(sourcePath: string): boolean {
  const extension = extname(sourcePath);
  return extension === ".ts" || extension === ".tsx";
}

function scriptKindFor(sourcePath: string): ScriptKind | null {
  const extension = extname(sourcePath);
  if (extension === ".ts") return ScriptKind.TS;
  if (extension === ".tsx") return ScriptKind.TSX;
  return null;
}

function declarationName(node: Node): string | null {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isTypeAliasDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isModuleDeclaration(node)
  ) {
    if (!node.isExported() || node.isDefaultExport()) return null;
    return node.getName() ?? null;
  }

  if (!Node.isVariableStatement(node) || !node.isExported() || node.isDefaultExport()) return null;
  const declarations = node.getDeclarations();
  if (declarations.length !== 1) return null;
  const name = declarations[0]?.getNameNode();
  return name !== undefined && Node.isIdentifier(name) ? name.getText() : null;
}

function declarationKind(node: Node): string {
  if (Node.isFunctionDeclaration(node)) return "FunctionDeclaration";
  if (Node.isClassDeclaration(node)) return "ClassDeclaration";
  if (Node.isInterfaceDeclaration(node)) return "InterfaceDeclaration";
  if (Node.isTypeAliasDeclaration(node)) return "TypeAliasDeclaration";
  if (Node.isEnumDeclaration(node)) return "EnumDeclaration";
  if (Node.isModuleDeclaration(node)) return "ModuleDeclaration";
  if (Node.isVariableStatement(node)) return "VariableStatement";
  return "UnsupportedDeclaration";
}

function anchorsOf(source: SourceFile): TypeScriptMergeAnchor[] {
  const anchors: TypeScriptMergeAnchor[] = [];
  for (const statement of source.getStatements()) {
    const statementStart = statement.getStart();
    const children = statement.getChildren();
    const firstSyntaxChild = children.find((child) => child.getStart() >= statementStart);
    const lastSyntaxChild = children
      .slice()
      .reverse()
      .find((child) => child.getEnd() <= statement.getEnd());
    const boundary = {
      start: statementStart,
      end: statement.getEnd(),
      firstTokenEnd: firstSyntaxChild?.getEnd() ?? statementStart,
      lastTokenStart: lastSyntaxChild?.getStart() ?? statement.getEnd(),
    };

    if (Node.isImportDeclaration(statement)) {
      anchors.push({
        key: `ImportDeclaration:${statement.getModuleSpecifierValue()}`,
        ...boundary,
      });
      continue;
    }

    const name = declarationName(statement);
    if (name !== null) {
      anchors.push({ key: `${declarationKind(statement)}:${name}`, ...boundary });
    }
  }
  return anchors;
}

function parse(
  project: Project,
  text: string,
  fileName: string,
  scriptKind: ScriptKind,
): ParsedSource {
  const source = project.createSourceFile(fileName, text, { scriptKind });
  const compilerSource = source.compilerNode as typeof source.compilerNode & {
    parseDiagnostics?: readonly unknown[];
  };
  // TypeScript strips a leading BOM and reports compiler positions against the
  // stripped text. Output slices remain positions in the original string.
  const sourceOffset = text.startsWith("\uFEFF") ? 1 : 0;
  const anchors = anchorsOf(source).map((anchor) => ({
    ...anchor,
    start: anchor.start + sourceOffset,
    end: anchor.end + sourceOffset,
    firstTokenEnd: anchor.firstTokenEnd + sourceOffset,
    lastTokenStart: anchor.lastTokenStart + sourceOffset,
  }));
  const keyCounts = new Map<string, number>();
  for (const anchor of anchors) keyCounts.set(anchor.key, (keyCounts.get(anchor.key) ?? 0) + 1);
  return {
    anchors,
    keyCounts,
    parseUncertain: (compilerSource.parseDiagnostics?.length ?? 0) > 0,
  };
}

function inspectSources(
  texts: string[],
  sourcePath: string,
): TypeScriptMergeSourceInspection[] | null {
  const scriptKind = scriptKindFor(sourcePath);
  if (scriptKind === null) return null;
  const extension = extname(sourcePath);
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  return texts.map((text, index) => {
    const parsed = parse(project, text, `source-${index}${extension}`, scriptKind);
    return {
      anchors: parsed.anchors,
      parseUncertain: parsed.parseUncertain,
      duplicateKeys: [...parsed.keyCounts.entries()]
        .filter(([, count]) => count !== 1)
        .map(([key]) => key)
        .sort(),
    };
  });
}

/** Read-only inventory used by the committed history/runtime probes. */
export function inspectTypeScriptMergeSource(
  text: string,
  sourcePath: string,
): TypeScriptMergeSourceInspection {
  const inspection = inspectSources([text], sourcePath)?.[0];
  if (inspection === undefined) throw new Error(`unsupported TypeScript source: ${sourcePath}`);
  return inspection;
}

function uniqueAnchorMap(anchors: TypeScriptMergeAnchor[]): Map<string, TypeScriptMergeAnchor> {
  const counts = new Map<string, number>();
  for (const anchor of anchors) counts.set(anchor.key, (counts.get(anchor.key) ?? 0) + 1);
  const result = new Map<string, TypeScriptMergeAnchor>();
  for (const anchor of anchors) {
    if (counts.get(anchor.key) === 1) result.set(anchor.key, anchor);
  }
  return result;
}

function applyReplacements(
  base: string,
  replacements: TypeScriptMergeReplacement[],
): string | null {
  const ordered = [...replacements].sort(
    (left, right) => right.baseStart - left.baseStart || right.baseEnd - left.baseEnd,
  );
  let previousStart = base.length;
  let result = base;
  for (const replacement of ordered) {
    if (
      replacement.baseStart < 0 ||
      replacement.baseEnd < replacement.baseStart ||
      replacement.baseEnd > base.length ||
      replacement.baseEnd > previousStart
    ) {
      return null;
    }
    result = `${result.slice(0, replacement.baseStart)}${replacement.text}${result.slice(replacement.baseEnd)}`;
    previousStart = replacement.baseStart;
  }
  return result;
}

function analyzeExactSide(
  side: "local" | "incoming",
  baseText: string,
  variantText: string,
  baseAnchors: Map<string, TypeScriptMergeAnchor>,
  variantAnchors: Map<string, TypeScriptMergeAnchor>,
): ExactSideAnalysis {
  const replacements: TypeScriptMergeReplacement[] = [];
  const ranges: TypeScriptMergeRange[] = [];

  for (const [key, baseAnchor] of baseAnchors) {
    const variantAnchor = variantAnchors.get(key);
    if (variantAnchor === undefined) continue;
    const baseSlice = baseText.slice(baseAnchor.start, baseAnchor.end);
    const variantSlice = variantText.slice(variantAnchor.start, variantAnchor.end);
    if (baseSlice === variantSlice) continue;
    replacements.push({
      key,
      side,
      baseStart: baseAnchor.start,
      baseEnd: baseAnchor.end,
      text: variantSlice,
    });
    ranges.push({
      baseStart: baseAnchor.start,
      baseEnd: baseAnchor.end,
      variantStart: variantAnchor.start,
      variantEnd: variantAnchor.end,
    });
  }

  const reasons: TypeScriptMergeReason[] = [];
  if (applyReplacements(baseText, replacements) !== variantText) {
    reasons.push({ code: "reconstruction-mismatch", side });
  }
  return {
    keys: replacements.map((replacement) => replacement.key).sort(),
    replacements,
    reasons,
    ranges,
  };
}

function refused(
  reasons: TypeScriptMergeReason[],
  local: TypeScriptMergeSide = EMPTY_SIDE,
  incoming: TypeScriptMergeSide = EMPTY_SIDE,
): ExactClassificationAnalysis {
  return {
    classification: { decision: "must-refuse", local, incoming, reasons },
    localReplacements: [],
    incomingReplacements: [],
  };
}

function analyzeExactClassification(input: TypeScriptMergeInput): ExactClassificationAnalysis {
  if (!isTypeScriptMergeSource(input.sourcePath)) {
    return refused([{ code: "unsupported-source" }]);
  }
  if (input.crossFile) return refused([{ code: "cross-file-change" }]);

  const inspections = inspectSources([input.base, input.local, input.incoming], input.sourcePath);
  const baseInspection = inspections?.[0];
  const localInspection = inspections?.[1];
  const incomingInspection = inspections?.[2];
  if (
    baseInspection === undefined ||
    localInspection === undefined ||
    incomingInspection === undefined
  ) {
    return refused([{ code: "unsupported-source" }]);
  }

  const parseReasons: TypeScriptMergeReason[] = [];
  if (baseInspection.parseUncertain) parseReasons.push({ code: "parse-uncertain" });
  if (localInspection.parseUncertain) {
    parseReasons.push({ code: "parse-uncertain", side: "local" });
  }
  if (incomingInspection.parseUncertain) {
    parseReasons.push({ code: "parse-uncertain", side: "incoming" });
  }
  if (parseReasons.length > 0) return refused(parseReasons);

  const baseAnchors = uniqueAnchorMap(baseInspection.anchors);
  const localAnalysis = analyzeExactSide(
    "local",
    input.base,
    input.local,
    baseAnchors,
    uniqueAnchorMap(localInspection.anchors),
  );
  const incomingAnalysis = analyzeExactSide(
    "incoming",
    input.base,
    input.incoming,
    baseAnchors,
    uniqueAnchorMap(incomingInspection.anchors),
  );
  const reasons = [...localAnalysis.reasons, ...incomingAnalysis.reasons];
  const incomingKeys = new Set(incomingAnalysis.keys);
  const sharedKeys = localAnalysis.keys.filter((key) => incomingKeys.has(key));
  if (sharedKeys.length > 0) reasons.push({ code: "same-key-change", keys: sharedKeys });

  return {
    classification: {
      decision: reasons.length === 0 ? "independent-candidate" : "must-refuse",
      local: { ranges: localAnalysis.ranges, keys: localAnalysis.keys },
      incoming: { ranges: incomingAnalysis.ranges, keys: incomingAnalysis.keys },
      reasons,
    },
    localReplacements: localAnalysis.replacements,
    incomingReplacements: incomingAnalysis.replacements,
  };
}

export function classifyTypeScriptMerge(
  input: TypeScriptMergeInput,
): TypeScriptMergeClassification {
  return analyzeExactClassification(input).classification;
}

/**
 * Combine exact original source slices only after both sides independently
 * reconstruct byte-for-byte. No AST-produced source can reach this result.
 */
export function mergeTypeScriptExactly(input: TypeScriptMergeInput): TypeScriptMergeResult {
  const analysis = analyzeExactClassification(input);
  const { classification } = analysis;
  if (classification.reasons.some((reason) => reason.code === "unsupported-source")) {
    return { ok: false, refusal: "unsupported-source", classification };
  }
  if (classification.decision !== "independent-candidate") {
    return { ok: false, refusal: "classification-refused", classification };
  }

  const replacements = [...analysis.localReplacements, ...analysis.incomingReplacements];
  const content = applyReplacements(input.base, replacements);
  if (content === null) {
    return { ok: false, refusal: "overlapping-base-ranges", classification };
  }
  const mergedInspection = inspectSources([content], input.sourcePath)?.[0];
  if (mergedInspection === undefined || mergedInspection.parseUncertain) {
    return { ok: false, refusal: "merged-parse-uncertain", classification };
  }

  return {
    ok: true,
    content,
    classification,
    replacements,
    proof: {
      localReconstructedExactly: true,
      incomingReconstructedExactly: true,
      mergedParses: true,
    },
  };
}
