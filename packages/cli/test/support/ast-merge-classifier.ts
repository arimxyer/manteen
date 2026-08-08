/**
 * Evidence-only D41 spike: classify three-way TypeScript edits without emitting source.
 *
 * This module deliberately lives under test/. Production update/diff do not import it.
 * It reads syntax only, keeps every offset in the original strings, and never asks a
 * ts-morph printer to produce merge bytes.
 */
import { diffLines } from "diff";
import { Node, Project, ScriptKind, type SourceFile } from "ts-morph";

export type AstClassificationDecision = "independent-candidate" | "must-refuse";

export type AstClassificationReasonCode =
  | "cross-file-change"
  | "parse-uncertain"
  | "unmapped-change"
  | "non-unique-key"
  | "key-changed"
  | "same-key-change";

export interface ExactChangeRange {
  baseStart: number;
  baseEnd: number;
  variantStart: number;
  variantEnd: number;
}

export interface AstClassificationReason {
  code: AstClassificationReasonCode;
  side?: "local" | "incoming";
  range?: ExactChangeRange;
  keys?: string[];
}

export interface AstClassificationSide {
  ranges: ExactChangeRange[];
  keys: string[];
}

export interface AstClassificationResult {
  decision: AstClassificationDecision;
  local: AstClassificationSide;
  incoming: AstClassificationSide;
  reasons: AstClassificationReason[];
}

export interface AstClassificationInput {
  base: string;
  local: string;
  incoming: string;
  /** True when this edit cannot be evaluated as one self-contained source file. */
  crossFile?: boolean;
}

interface Anchor {
  key: string;
  start: number;
  end: number;
}

interface ParsedSource {
  anchors: Anchor[];
  keyCounts: Map<string, number>;
  parseUncertain: boolean;
}

interface SideAnalysis extends AstClassificationSide {
  reasons: AstClassificationReason[];
}

function exactChangeRanges(base: string, variant: string): ExactChangeRange[] {
  const ranges: ExactChangeRange[] = [];
  let baseOffset = 0;
  let variantOffset = 0;
  let pending: ExactChangeRange | null = null;

  const flush = () => {
    if (pending === null) return;
    ranges.push(pending);
    pending = null;
  };

  for (const part of diffLines(base, variant)) {
    if (!part.added && !part.removed) {
      flush();
      baseOffset += part.value.length;
      variantOffset += part.value.length;
      continue;
    }

    pending ??= {
      baseStart: baseOffset,
      baseEnd: baseOffset,
      variantStart: variantOffset,
      variantEnd: variantOffset,
    };
    if (part.removed) {
      baseOffset += part.value.length;
      pending.baseEnd = baseOffset;
    }
    if (part.added) {
      variantOffset += part.value.length;
      pending.variantEnd = variantOffset;
    }
  }
  flush();
  return ranges;
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

function anchorsOf(source: SourceFile): Anchor[] {
  const anchors: Anchor[] = [];
  for (const statement of source.getStatements()) {
    if (Node.isImportDeclaration(statement)) {
      anchors.push({
        key: `ImportDeclaration:${statement.getModuleSpecifierValue()}`,
        start: statement.getStart(),
        end: statement.getEnd(),
      });
      continue;
    }

    const name = declarationName(statement);
    if (name === null) continue;
    anchors.push({
      key: `${declarationKind(statement)}:${name}`,
      start: statement.getStart(),
      end: statement.getEnd(),
    });
  }
  return anchors;
}

function parse(project: Project, text: string, fileName: string): ParsedSource {
  const source = project.createSourceFile(fileName, text, { scriptKind: ScriptKind.TSX });
  const compilerSource = source.compilerNode as typeof source.compilerNode & {
    parseDiagnostics?: readonly unknown[];
  };
  // TypeScript strips a leading BOM from SourceFile text and reports compiler
  // positions against the stripped string. Diff offsets stay against the
  // original bytes-as-decoded string, so restore that one-code-unit offset.
  const sourceOffset = text.startsWith("\uFEFF") ? 1 : 0;
  const anchors = anchorsOf(source).map((anchor) => ({
    ...anchor,
    start: anchor.start + sourceOffset,
    end: anchor.end + sourceOffset,
  }));
  const keyCounts = new Map<string, number>();
  for (const anchor of anchors) keyCounts.set(anchor.key, (keyCounts.get(anchor.key) ?? 0) + 1);
  return {
    anchors,
    keyCounts,
    parseUncertain: (compilerSource.parseDiagnostics?.length ?? 0) > 0,
  };
}

function anchorsForRange(anchors: Anchor[], start: number, end: number): Anchor[] {
  if (start === end) {
    return anchors.filter((anchor) => start >= anchor.start && start <= anchor.end);
  }
  return anchors.filter((anchor) => start < anchor.end && end > anchor.start);
}

function analyzeSide(
  side: "local" | "incoming",
  ranges: ExactChangeRange[],
  base: ParsedSource,
  variant: ParsedSource,
): SideAnalysis {
  const keys = new Set<string>();
  const reasons: AstClassificationReason[] = [];

  for (const range of ranges) {
    const baseAnchors = anchorsForRange(base.anchors, range.baseStart, range.baseEnd);
    const variantAnchors = anchorsForRange(variant.anchors, range.variantStart, range.variantEnd);
    const rangeKeys = new Set([...baseAnchors, ...variantAnchors].map((anchor) => anchor.key));

    if (baseAnchors.length === 0 || variantAnchors.length === 0 || rangeKeys.size === 0) {
      reasons.push({ code: "unmapped-change", side, range });
      continue;
    }
    if (rangeKeys.size !== 1) {
      reasons.push({ code: "key-changed", side, range, keys: [...rangeKeys].sort() });
      continue;
    }

    const [key] = rangeKeys;
    if (key === undefined) continue;
    if (base.keyCounts.get(key) !== 1 || variant.keyCounts.get(key) !== 1) {
      reasons.push({ code: "non-unique-key", side, range, keys: [key] });
      continue;
    }
    keys.add(key);
  }

  return { ranges, keys: [...keys].sort(), reasons };
}

/**
 * Return only a read-only candidate classification. This function never constructs merged text.
 */
export function classifyAstMerge(input: AstClassificationInput): AstClassificationResult {
  const localRanges = exactChangeRanges(input.base, input.local);
  const incomingRanges = exactChangeRanges(input.base, input.incoming);
  const emptySide = { ranges: [] as ExactChangeRange[], keys: [] as string[] };

  if (input.crossFile) {
    return {
      decision: "must-refuse",
      local: { ...emptySide, ranges: localRanges },
      incoming: { ...emptySide, ranges: incomingRanges },
      reasons: [{ code: "cross-file-change" }],
    };
  }

  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
  const base = parse(project, input.base, "base.tsx");
  const local = parse(project, input.local, "local.tsx");
  const incoming = parse(project, input.incoming, "incoming.tsx");
  const parseReasons: AstClassificationReason[] = [];
  if (base.parseUncertain) parseReasons.push({ code: "parse-uncertain" });
  if (local.parseUncertain) parseReasons.push({ code: "parse-uncertain", side: "local" });
  if (incoming.parseUncertain) parseReasons.push({ code: "parse-uncertain", side: "incoming" });
  if (parseReasons.length > 0) {
    return {
      decision: "must-refuse",
      local: { ranges: localRanges, keys: [] },
      incoming: { ranges: incomingRanges, keys: [] },
      reasons: parseReasons,
    };
  }

  const localAnalysis = analyzeSide("local", localRanges, base, local);
  const incomingAnalysis = analyzeSide("incoming", incomingRanges, base, incoming);
  const reasons = [...localAnalysis.reasons, ...incomingAnalysis.reasons];
  const incomingKeys = new Set(incomingAnalysis.keys);
  const sharedKeys = localAnalysis.keys.filter((key) => incomingKeys.has(key));
  if (sharedKeys.length > 0) {
    reasons.push({ code: "same-key-change", keys: sharedKeys });
  }

  return {
    decision: reasons.length === 0 ? "independent-candidate" : "must-refuse",
    local: { ranges: localAnalysis.ranges, keys: localAnalysis.keys },
    incoming: { ranges: incomingAnalysis.ranges, keys: incomingAnalysis.keys },
    reasons,
  };
}
