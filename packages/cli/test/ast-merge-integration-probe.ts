import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { mergeFile } from "../src/plan/merge-file";
import {
  classifyTypeScriptMerge,
  inspectTypeScriptMergeSource,
  mergeTypeScriptExactly,
  type TypeScriptMergeAnchor,
} from "../src/plan/merge-typescript";
import { classifyAstMerge } from "./support/ast-merge-classifier";
import { mergeAstCandidateExactlyWithLineRanges } from "./support/ast-merge-exact-prototype";

interface HistoricalCommit {
  baseRevision: string;
  incomingRevision: string;
  paths: string[];
}

interface HistoricalEvent {
  baseRevision: string;
  incomingRevision: string;
  path: string;
}

interface EventReport extends HistoricalEvent {
  lineRangeUpstreamDecision: "independent-candidate" | "must-refuse";
  lineRangeUpstreamPrototype: "ok" | string;
  lineRangeUpstreamReasons: string[];
  exactUpstreamDecision: "independent-candidate" | "must-refuse";
  exactUpstreamMerge: "ok" | string;
  exactUpstreamKeys: string[];
  exactUpstreamReasons: string[];
  anchors: number;
  constructedDisjointCases: number;
  constructedSameKeyCases: number;
  baselineConflicts: number;
  rescuedConflicts: number;
  lineRangeRescuedConflicts: number;
  falseAuthorizations: number;
  lineRangeFalseAuthorizations: number;
  falseRefusals: number;
  lineRangeFalseRefusals: number;
  asymmetricResults: number;
  rescuedKeys: string[];
  disjointRefusals: {
    key: string;
    mutation: "first-token" | "last-token";
    refusal: string;
    classificationReasons: string[];
  }[];
}

const HISTORY: HistoricalCommit[] = [
  {
    incomingRevision: "6e83ad1b0ab83a8062cdd0ed0e7bf28540cc77ee",
    baseRevision: "70afbf97fc4ef9d83391105fc6b1bc4360a145cf",
    paths: ["registry/mantine-ui/authentication-form/authentication-form.tsx"],
  },
  {
    incomingRevision: "70afbf97fc4ef9d83391105fc6b1bc4360a145cf",
    baseRevision: "cb76c01020b9d2ee0bae7fc06037062182d6ae2c",
    paths: [
      "registry/mantine-ui/authentication-form/authentication-form.tsx",
      "registry/mantine-ui/authentication-form/github-button.tsx",
      "registry/mantine-ui/authentication-form/google-button.tsx",
      "registry/mantine-ui/table-sort/table-sort.tsx",
    ],
  },
  {
    incomingRevision: "51b7593f73c816ddcf61ef36e3258ce063356429",
    baseRevision: "c84e66f257407389dc955853d6ee4f76cb151b97",
    paths: [
      "registry/mantine-ui/autocomplete-loading/autocomplete-loading.tsx",
      "registry/mantine-ui/floating-label-input/floating-label-input.tsx",
      "registry/mantine-ui/password-strength/password-strength.tsx",
    ],
  },
  {
    incomingRevision: "be1b06b24a26fa459cb5cd355df0a5f43f34ada3",
    baseRevision: "f7492d8ffa5a88f07e7ff8972b51e02e77b92e7c",
    paths: [
      "registry/blocks/data-table/data-table.tsx",
      "registry/mantine-ui/authentication-form/authentication-form.tsx",
    ],
  },
  {
    incomingRevision: "b11e3600dee6d4f72fc1404e644d3464b0e906cb",
    baseRevision: "689a314ae93f3d63973211574251f86ec87c6341",
    paths: [
      "registry/mantine-ui/button-progress/button-progress.tsx",
      "registry/mantine-ui/cards-carousel/cards-carousel.tsx",
      "registry/mantine-ui/dnd-list/dnd-list.tsx",
      "registry/ui/empty-state.tsx",
      "registry/ui/page-header.tsx",
      "registry/ui/stat-card.tsx",
    ],
  },
  {
    incomingRevision: "689a314ae93f3d63973211574251f86ec87c6341",
    baseRevision: "330968a9b2076efa47ee29d1a20a6cf6dd2684d7",
    paths: ["registry/mantine-ui/cards-carousel/cards-carousel.tsx"],
  },
  {
    incomingRevision: "0f86cac6bcdba7c5058d0719944b59f022eb3236",
    baseRevision: "55908eaccf36ba82d6486b74e81c3befcc64a3d2",
    paths: ["registry/mantine-ui/article-card/article-card.tsx"],
  },
  {
    incomingRevision: "edccf9458c7a23c389c4a5df1c13f7a31048b018",
    baseRevision: "5355e454683813c947d819f232f7a0f2610e7848",
    paths: [
      "registry/blocks/data-table/data-table.tsx",
      "registry/lib/data-table.theme.ts",
      "registry/lib/theme.ts",
      "registry/ui/empty-state.tsx",
      "registry/ui/page-header.tsx",
      "registry/ui/stat-card.tsx",
    ],
  },
  {
    incomingRevision: "5da31aeef222c3f169a1041aef60bc928ed3bea4",
    baseRevision: "eb8f29d9559bedcf4520fbd55bebb4e4cc03e56a",
    paths: ["registry/lib/data-table.theme.ts"],
  },
];

function readRevision(revision: string, path: string): string {
  return execFileSync("git", ["show", `${revision}:${path}`], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function events(): HistoricalEvent[] {
  return HISTORY.flatMap((entry) =>
    entry.paths.map((path) => ({
      baseRevision: entry.baseRevision,
      incomingRevision: entry.incomingRevision,
      path,
    })),
  );
}

function anchorText(source: string, anchor: TypeScriptMergeAnchor): string {
  return source.slice(anchor.start, anchor.end);
}

function uniqueAnchors(source: string, sourcePath: string): Map<string, TypeScriptMergeAnchor> {
  const inspection = inspectTypeScriptMergeSource(source, sourcePath);
  if (inspection.parseUncertain) throw new Error("historical source did not parse");
  const duplicates = new Set(inspection.duplicateKeys);
  return new Map(
    inspection.anchors
      .filter((anchor) => !duplicates.has(anchor.key))
      .map((anchor) => [anchor.key, anchor]),
  );
}

function mutateInsideAnchor(
  source: string,
  anchor: TypeScriptMergeAnchor,
  sourcePath: string,
  id: string,
  mutation: "first-token" | "last-token",
): string {
  const offset = mutation === "first-token" ? anchor.firstTokenEnd : anchor.lastTokenStart;
  const result = `${source.slice(0, offset)}/*manteen-local:${id}*/${source.slice(offset)}`;
  if (inspectTypeScriptMergeSource(result, sourcePath).parseUncertain) {
    throw new Error(`controlled ${mutation} mutation did not parse: ${anchor.key}`);
  }
  return result;
}

function classifyEvent(event: HistoricalEvent, eventIndex: number): EventReport {
  const base = readRevision(event.baseRevision, event.path);
  const incoming = readRevision(event.incomingRevision, event.path);
  const lineRangeUpstream = classifyAstMerge({ base, local: base, incoming });
  const lineRangeUpstreamPrototype = mergeAstCandidateExactlyWithLineRanges({
    base,
    local: base,
    incoming,
  });
  const exactUpstream = classifyTypeScriptMerge({
    sourcePath: event.path,
    base,
    local: base,
    incoming,
  });
  const exactUpstreamMerge = mergeTypeScriptExactly({
    sourcePath: event.path,
    base,
    local: base,
    incoming,
  });
  const baseAnchors = uniqueAnchors(base, event.path);
  const incomingAnchors = uniqueAnchors(incoming, event.path);
  const upstreamKeys = new Set(exactUpstream.incoming.keys);
  const stableKeys = [...baseAnchors.keys()].filter((key) => incomingAnchors.has(key));
  const disjointKeys =
    exactUpstream.decision === "independent-candidate"
      ? stableKeys.filter(
          (key) =>
            !upstreamKeys.has(key) &&
            anchorText(base, baseAnchors.get(key) as TypeScriptMergeAnchor) ===
              anchorText(incoming, incomingAnchors.get(key) as TypeScriptMergeAnchor),
        )
      : [];
  const sameKeys =
    exactUpstream.decision === "independent-candidate"
      ? stableKeys.filter((key) => upstreamKeys.has(key))
      : [];
  const disjointMutations = disjointKeys.flatMap((key) =>
    (["first-token", "last-token"] as const).map((mutation) => ({ key, mutation })),
  );
  const sameKeyMutations = sameKeys.flatMap((key) =>
    (["first-token", "last-token"] as const).map((mutation) => ({ key, mutation })),
  );

  let baselineConflicts = 0;
  let rescuedConflicts = 0;
  let lineRangeRescuedConflicts = 0;
  let falseAuthorizations = 0;
  let lineRangeFalseAuthorizations = 0;
  let falseRefusals = 0;
  let lineRangeFalseRefusals = 0;
  let asymmetricResults = 0;
  const rescuedKeys: string[] = [];
  const disjointRefusals: {
    key: string;
    mutation: "first-token" | "last-token";
    refusal: string;
    classificationReasons: string[];
  }[] = [];

  for (const [caseIndex, { key, mutation }] of disjointMutations.entries()) {
    const anchor = baseAnchors.get(key) as TypeScriptMergeAnchor;
    const local = mutateInsideAnchor(
      base,
      anchor,
      event.path,
      `${eventIndex}-distinct-${caseIndex}`,
      mutation,
    );
    const baseline = mergeFile(local, base, incoming);
    const lineRangePrototype = mergeAstCandidateExactlyWithLineRanges({ base, local, incoming });
    const mergeStart = performance.now();
    const exactMerge = mergeTypeScriptExactly({ sourcePath: event.path, base, local, incoming });
    void (performance.now() - mergeStart);
    const reverse = mergeTypeScriptExactly({
      sourcePath: event.path,
      base,
      local: incoming,
      incoming: local,
    });

    if (!baseline.ok) baselineConflicts += 1;
    if (!lineRangePrototype.ok) lineRangeFalseRefusals += 1;
    if (!baseline.ok && lineRangePrototype.ok) lineRangeRescuedConflicts += 1;
    if (!exactMerge.ok) {
      falseRefusals += 1;
      disjointRefusals.push({
        key,
        mutation,
        refusal: exactMerge.refusal,
        classificationReasons: [
          ...new Set(exactMerge.classification.reasons.map((reason) => reason.code)),
        ].sort(),
      });
      continue;
    }
    if (!reverse.ok || reverse.content !== exactMerge.content) asymmetricResults += 1;
    if (!baseline.ok) {
      rescuedConflicts += 1;
      rescuedKeys.push(`${key}:${mutation}`);
    }
  }

  for (const [caseIndex, { key, mutation }] of sameKeyMutations.entries()) {
    const anchor = baseAnchors.get(key) as TypeScriptMergeAnchor;
    const local = mutateInsideAnchor(
      base,
      anchor,
      event.path,
      `${eventIndex}-same-${caseIndex}`,
      mutation,
    );
    const lineRangePrototype = mergeAstCandidateExactlyWithLineRanges({ base, local, incoming });
    const exactMerge = mergeTypeScriptExactly({ sourcePath: event.path, base, local, incoming });
    if (lineRangePrototype.ok) lineRangeFalseAuthorizations += 1;
    if (exactMerge.ok) falseAuthorizations += 1;
  }

  // Every event also receives one deliberately unanchored local edit. It must
  // never be authorized even when the upstream side itself is classifiable.
  const unanchoredLocal = `${base}\n// manteen-local:unanchored-${eventIndex}\n`;
  if (mergeAstCandidateExactlyWithLineRanges({ base, local: unanchoredLocal, incoming }).ok) {
    lineRangeFalseAuthorizations += 1;
  }
  if (
    mergeTypeScriptExactly({
      sourcePath: event.path,
      base,
      local: unanchoredLocal,
      incoming,
    }).ok
  ) {
    falseAuthorizations += 1;
  }

  return {
    ...event,
    lineRangeUpstreamDecision: lineRangeUpstream.decision,
    lineRangeUpstreamPrototype: lineRangeUpstreamPrototype.ok
      ? "ok"
      : lineRangeUpstreamPrototype.refusal,
    lineRangeUpstreamReasons: [
      ...new Set(lineRangeUpstream.reasons.map((reason) => reason.code)),
    ].sort(),
    exactUpstreamDecision: exactUpstream.decision,
    exactUpstreamMerge: exactUpstreamMerge.ok ? "ok" : exactUpstreamMerge.refusal,
    exactUpstreamKeys: exactUpstream.incoming.keys,
    exactUpstreamReasons: [...new Set(exactUpstream.reasons.map((reason) => reason.code))].sort(),
    anchors: baseAnchors.size,
    constructedDisjointCases: disjointMutations.length,
    constructedSameKeyCases: sameKeyMutations.length,
    baselineConflicts,
    rescuedConflicts,
    lineRangeRescuedConflicts,
    falseAuthorizations,
    lineRangeFalseAuthorizations,
    falseRefusals,
    lineRangeFalseRefusals,
    asymmetricResults,
    rescuedKeys,
    disjointRefusals,
  };
}

const startedAt = performance.now();
const eventReports = events().map(classifyEvent);
const elapsedMs = performance.now() - startedAt;
const sum = (select: (event: EventReport) => number) =>
  eventReports.reduce((total, event) => total + select(event), 0);

const report = {
  schemaVersion: 2,
  experiment: "ast-exact-splice-integration-decision",
  evidence: {
    upstream: "real-repository-history",
    local: "constructed-in-anchor-mutations",
    consumerTelemetry: false,
  },
  corpus: {
    commits: HISTORY.length,
    fileEvents: eventReports.length,
    sourcePaths: new Set(eventReports.map((event) => event.path)).size,
    lineRangeClassifiableUpstreamEvents: eventReports.filter(
      (event) => event.lineRangeUpstreamDecision === "independent-candidate",
    ).length,
    exactClassifiableUpstreamEvents: eventReports.filter(
      (event) => event.exactUpstreamDecision === "independent-candidate",
    ).length,
    constructedDisjointCases: sum((event) => event.constructedDisjointCases),
    constructedSameKeyCases: sum((event) => event.constructedSameKeyCases),
  },
  result: {
    baselineConflicts: sum((event) => event.baselineConflicts),
    lineRangeRescuedConflicts: sum((event) => event.lineRangeRescuedConflicts),
    rescuedConflicts: sum((event) => event.rescuedConflicts),
    rescuedSourcePaths: new Set(
      eventReports.filter((event) => event.rescuedConflicts > 0).map((event) => event.path),
    ).size,
    falseAuthorizations: sum((event) => event.falseAuthorizations),
    lineRangeFalseAuthorizations: sum((event) => event.lineRangeFalseAuthorizations),
    falseRefusals: sum((event) => event.falseRefusals),
    lineRangeFalseRefusals: sum((event) => event.lineRangeFalseRefusals),
    asymmetricResults: sum((event) => event.asymmetricResults),
  },
  runtime: {
    wholeProbeMs: Math.round(elapsedMs),
  },
  events: eventReports,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
