/**
 * Evidence-only exact-splice prototype for the AST integration decision.
 *
 * This is deliberately test support. It never asks ts-morph to print source.
 * A candidate succeeds only when replacing whole, uniquely keyed original
 * source ranges can reconstruct both input sides byte-for-byte before their
 * disjoint replacements are combined.
 */
import {
  type AstClassificationInput,
  type AstClassificationResult,
  type AstMergeAnchor,
  classifyAstMerge,
  inspectAstMergeSource,
} from "./ast-merge-classifier";

export type AstExactPrototypeRefusal =
  | "classification-refused"
  | "anchor-missing"
  | "anchor-not-unique"
  | "overlapping-base-ranges"
  | "local-reconstruction-mismatch"
  | "incoming-reconstruction-mismatch"
  | "merged-parse-uncertain";

export interface AstExactReplacement {
  key: string;
  side: "local" | "incoming";
  baseStart: number;
  baseEnd: number;
  text: string;
}

export type AstExactPrototypeResult =
  | {
      ok: false;
      refusal: AstExactPrototypeRefusal;
      classification: AstClassificationResult;
    }
  | {
      ok: true;
      content: string;
      classification: AstClassificationResult;
      replacements: AstExactReplacement[];
      proof: {
        localReconstructedExactly: true;
        incomingReconstructedExactly: true;
        mergedParses: true;
      };
    };

function uniqueAnchorMap(anchors: AstMergeAnchor[]): Map<string, AstMergeAnchor> {
  const counts = new Map<string, number>();
  for (const anchor of anchors) counts.set(anchor.key, (counts.get(anchor.key) ?? 0) + 1);
  const result = new Map<string, AstMergeAnchor>();
  for (const anchor of anchors) {
    if (counts.get(anchor.key) === 1) result.set(anchor.key, anchor);
  }
  return result;
}

function applyReplacements(base: string, replacements: AstExactReplacement[]): string | null {
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

function replacementsForSide(
  side: "local" | "incoming",
  source: string,
  keys: string[],
  baseAnchors: Map<string, AstMergeAnchor>,
): AstExactReplacement[] | null {
  const variantInspection = inspectAstMergeSource(source);
  if (variantInspection.parseUncertain) return null;
  const variantAnchors = uniqueAnchorMap(variantInspection.anchors);

  const replacements: AstExactReplacement[] = [];
  for (const key of keys) {
    const baseAnchor = baseAnchors.get(key);
    const variantAnchor = variantAnchors.get(key);
    if (baseAnchor === undefined || variantAnchor === undefined) return null;
    replacements.push({
      key,
      side,
      baseStart: baseAnchor.start,
      baseEnd: baseAnchor.end,
      text: source.slice(variantAnchor.start, variantAnchor.end),
    });
  }
  return replacements;
}

export function mergeAstCandidateExactlyWithLineRanges(
  input: AstClassificationInput,
): AstExactPrototypeResult {
  const classification = classifyAstMerge(input);
  if (classification.decision !== "independent-candidate") {
    return { ok: false, refusal: "classification-refused", classification };
  }

  const baseInspection = inspectAstMergeSource(input.base);
  if (baseInspection.parseUncertain) {
    return { ok: false, refusal: "anchor-missing", classification };
  }
  const baseAnchors = uniqueAnchorMap(baseInspection.anchors);

  const localReplacements = replacementsForSide(
    "local",
    input.local,
    classification.local.keys,
    baseAnchors,
  );
  const incomingReplacements = replacementsForSide(
    "incoming",
    input.incoming,
    classification.incoming.keys,
    baseAnchors,
  );
  if (localReplacements === null || incomingReplacements === null) {
    return { ok: false, refusal: "anchor-missing", classification };
  }

  if (applyReplacements(input.base, localReplacements) !== input.local) {
    return { ok: false, refusal: "local-reconstruction-mismatch", classification };
  }
  if (applyReplacements(input.base, incomingReplacements) !== input.incoming) {
    return { ok: false, refusal: "incoming-reconstruction-mismatch", classification };
  }

  const replacements = [...localReplacements, ...incomingReplacements];
  const content = applyReplacements(input.base, replacements);
  if (content === null) {
    return { ok: false, refusal: "overlapping-base-ranges", classification };
  }
  if (inspectAstMergeSource(content).parseUncertain) {
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
