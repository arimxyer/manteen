import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { mergeFile } from "../src/plan/merge-file";
import {
  classifyTypeScriptMerge,
  inspectTypeScriptMergeSource,
  mergeTypeScriptExactly,
} from "../src/plan/merge-typescript";

interface RuntimeCase {
  id: string;
  path: string;
  expected: "merge" | "refuse";
  base: string;
  local: string;
  incoming: string;
}

const WARMUPS = 3;
const ITERATIONS = 20;

function readRevision(revision: string, path: string): string {
  return execFileSync("git", ["show", `${revision}:${path}`], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function percentile(sorted: number[], fraction: number): number {
  const value = sorted[Math.ceil(sorted.length * fraction) - 1];
  if (value === undefined) throw new Error("runtime sample missing");
  return value;
}

function sample(run: () => void): number[] {
  for (let index = 0; index < WARMUPS; index += 1) run();
  const samples: number[] = [];
  for (let index = 0; index < ITERATIONS; index += 1) {
    const startedAt = performance.now();
    run();
    samples.push(performance.now() - startedAt);
  }
  return samples.sort((left, right) => left - right);
}

function summary(samples: number[]) {
  return {
    minMs: samples[0],
    medianMs: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: samples.at(-1),
  };
}

function exactRun(runtimeCase: RuntimeCase): void {
  const result = mergeTypeScriptExactly({
    sourcePath: runtimeCase.path,
    ...runtimeCase,
  });
  if ((runtimeCase.expected === "merge") !== result.ok) {
    throw new Error(`${runtimeCase.id}: unexpected production exact-merge result`);
  }
}

function cases(): RuntimeCase[] {
  const fixtureRoot = resolve(import.meta.dirname, "fixtures", "ast-merge-corpus");
  const carouselPath = "registry/mantine-ui/cards-carousel/cards-carousel.tsx";
  const carousel: RuntimeCase = {
    id: "historical-carousel-accepted",
    path: carouselPath,
    expected: "merge",
    base: readFileSync(resolve(fixtureRoot, "revisions/cards-carousel-330968a.tsx.txt"), "utf8"),
    local: readFileSync(resolve(fixtureRoot, "locals/local-adjacent-import.tsx.txt"), "utf8"),
    incoming: readFileSync(
      resolve(fixtureRoot, "revisions/cards-carousel-689a314.tsx.txt"),
      "utf8",
    ),
  };

  const dataTablePath = "registry/blocks/data-table/data-table.tsx";
  const dataTableBase = readRevision("f7492d8ffa5a88f07e7ff8972b51e02e77b92e7c", dataTablePath);
  const dataTableIncoming = readRevision("be1b06b24a26fa459cb5cd355df0a5f43f34ada3", dataTablePath);
  const incomingKeys = new Set(
    classifyTypeScriptMerge({
      sourcePath: dataTablePath,
      base: dataTableBase,
      local: dataTableBase,
      incoming: dataTableIncoming,
    }).incoming.keys,
  );
  const disjointAnchor = inspectTypeScriptMergeSource(dataTableBase, dataTablePath).anchors.find(
    (anchor) => !incomingKeys.has(anchor.key),
  );
  if (disjointAnchor === undefined) throw new Error("data-table disjoint anchor missing");
  const dataTableLocal = `${dataTableBase.slice(0, disjointAnchor.firstTokenEnd)}/*runtime-probe*/${dataTableBase.slice(disjointAnchor.firstTokenEnd)}`;

  const passwordPath = "registry/mantine-ui/password-strength/password-strength.tsx";
  const passwordBase = readRevision("c84e66f257407389dc955853d6ee4f76cb151b97", passwordPath);
  const passwordIncoming = readRevision("51b7593f73c816ddcf61ef36e3258ce063356429", passwordPath);

  return [
    carousel,
    {
      id: "historical-data-table-accepted",
      path: dataTablePath,
      expected: "merge",
      base: dataTableBase,
      local: dataTableLocal,
      incoming: dataTableIncoming,
    },
    {
      id: "largest-history-event-refused",
      path: passwordPath,
      expected: "refuse",
      base: passwordBase,
      local: passwordBase.replace("PasswordInput", "PasswordInput /* runtime-probe */"),
      incoming: passwordIncoming,
    },
  ];
}

const reports = cases().map((runtimeCase) => {
  const baseline = mergeFile(runtimeCase.local, runtimeCase.base, runtimeCase.incoming);
  const baselineSamples = sample(() => {
    mergeFile(runtimeCase.local, runtimeCase.base, runtimeCase.incoming);
  });
  const exactSamples = sample(() => exactRun(runtimeCase));
  return {
    id: runtimeCase.id,
    path: runtimeCase.path,
    expected: runtimeCase.expected,
    bytes: {
      base: runtimeCase.base.length,
      local: runtimeCase.local.length,
      incoming: runtimeCase.incoming.length,
    },
    productionBaseline: baseline.ok ? "merged" : "conflict",
    lineMerge: summary(baselineSamples),
    exactMerge: summary(exactSamples),
  };
});

const acceptedP95 = reports
  .filter((report) => report.expected === "merge")
  .map((report) => report.exactMerge.p95Ms);
const thresholdMs = 250;
process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      experiment: "ast-exact-splice-runtime",
      timingScope: "preloaded-source production exact-merge call; excludes Git and filesystem I/O",
      warmups: WARMUPS,
      iterations: ITERATIONS,
      acceptance: {
        acceptedCandidateP95ThresholdMs: thresholdMs,
        passed: acceptedP95.every((value) => value <= thresholdMs),
      },
      cases: reports,
    },
    null,
    2,
  )}\n`,
);
