/** Pure W6 init composition: detection -> proposals -> hashes -> verdict. */
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import { isInsideRoot } from "../config/aliases";
import { diag, downgradeForced, isBlocking, sortDiagnostics } from "../plan/diagnostics";
import type { Diagnostic } from "../plan/types";
import {
  initConfigConflict,
  initFrameworkAmbiguous,
  initFrameworkMismatch,
  initFrameworkUnrecognized,
  initPathEscapesRoot,
} from "./diagnostics";
import { planShared } from "./shared";
import type {
  InitDetectionResult,
  InitFrameworkSet,
  InitPlan,
  InitPlannedDependency,
  InitPlannedFile,
  InitPlanOptions,
  InitPlanPorts,
  InitProjectSnapshot,
  InitProposedFile,
  PlanInitFn,
} from "./types";
import { frameworkSetFor, INIT_ALIASES } from "./types";

export const INIT_DEPENDENCIES: readonly InitPlannedDependency[] = [
  { name: "@mantine/core", range: "^9", dev: false, wantedBy: ["shared:provider"] },
  { name: "@mantine/hooks", range: "^9", dev: false, wantedBy: ["shared:provider"] },
  {
    name: "postcss-preset-mantine",
    range: "^1",
    dev: true,
    wantedBy: ["shared:postcss"],
  },
  { name: "postcss-simple-vars", range: "^7", dev: true, wantedBy: ["shared:postcss"] },
];

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hashText(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function failureFramework(
  detection: InitDetectionResult,
  options: InitPlanOptions,
): InitFrameworkSet {
  if (detection.ok) return detection.framework;
  return frameworkSetFor(options.framework ?? "manual");
}

function detectionDiagnostic(
  root: string,
  result: Extract<InitDetectionResult, { ok: false }>,
  options: InitPlanOptions,
): Diagnostic {
  if (result.reason === "unrecognized") return initFrameworkUnrecognized(root);
  if (result.reason === "ambiguous") return initFrameworkAmbiguous(root, result.candidates);
  const requested = options.framework ?? "manual";
  const candidates =
    result.candidates.length > 0
      ? `Detected ${result.candidates.join(", ")}.`
      : "No matching framework markers were found.";
  return initFrameworkMismatch(root, requested, candidates);
}

function emptyPlan(
  root: string,
  framework: InitFrameworkSet,
  diagnostics: readonly Diagnostic[],
): InitPlan {
  return {
    version: 1,
    root,
    framework,
    files: [],
    dependencies: [],
    packageManager: null,
    installCommand: null,
    instructions: [],
    diagnostics: sortDiagnostics(diagnostics),
    ok: false,
  };
}

function diagnosticFromThrown(error: unknown): Diagnostic | null {
  if (typeof error !== "object" || error === null || !("diagnostic" in error)) return null;
  const diagnostic = (error as { diagnostic?: unknown }).diagnostic;
  if (typeof diagnostic !== "object" || diagnostic === null || !("code" in diagnostic)) return null;
  return diagnostic as Diagnostic;
}

function wantedDependencies(project: InitProjectSnapshot): InitPlannedDependency[] {
  return INIT_DEPENDENCIES.filter(
    (dependency) => !project.declaredDependencies.has(dependency.name),
  ).map((dependency) => ({ ...dependency, wantedBy: [...dependency.wantedBy] }));
}

function dedupeProposals(files: readonly InitProposedFile[]): InitProposedFile[] {
  const byDestination = new Map<string, InitProposedFile>();
  for (const file of files) {
    const prior = byDestination.get(file.destination);
    if (prior === undefined) {
      byDestination.set(file.destination, file);
      continue;
    }
    if (prior.kind !== file.kind || prior.content !== file.content) {
      throw new Error(
        `planInit: ${file.destination} was proposed twice with different final bytes (${prior.kind}, ${file.kind}).`,
      );
    }
  }
  return [...byDestination.values()].sort(
    (a, b) => compare(a.destination, b.destination) || compare(a.kind, b.kind),
  );
}

function plannedFiles(
  root: string,
  proposals: readonly InitProposedFile[],
  ports: InitPlanPorts,
  diagnostics: Diagnostic[],
): InitPlannedFile[] {
  const files: InitPlannedFile[] = [];
  for (const proposal of dedupeProposals(proposals)) {
    if (!isInsideRoot(proposal.destination, root)) {
      diagnostics.push(initPathEscapesRoot(root, proposal.destination));
      continue;
    }

    let existingSha: string | null;
    try {
      existingSha = ports.hashFile(proposal.destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EISDIR") throw error;
      diagnostics.push(
        initConfigConflict(proposal.destination, "a directory occupies the planned file path"),
      );
      continue;
    }
    const sha256 = hashText(proposal.content);
    if (existingSha === sha256) continue;
    files.push({
      ...proposal,
      sha256,
      existing: existingSha === null ? null : { sha256: existingSha },
      disposition: existingSha === null ? "create" : "update",
    });
  }
  return files;
}

function packageJsonInstallCollision(
  root: string,
  files: readonly InitProposedFile[],
  dependencies: readonly InitPlannedDependency[],
): Diagnostic | null {
  const packagePath = join(root, "package.json");
  if (dependencies.length === 0 || !files.some((file) => file.destination === packagePath)) {
    return null;
  }
  return initConfigConflict(
    packagePath,
    "PostCSS is embedded in package.json while init also needs to add dependencies; the package manager would change the same file before the planned exact-byte write. Declare the four init dependencies first or move PostCSS to a supported standalone config",
  );
}

async function planInitCore(
  cwd: string,
  options: InitPlanOptions,
  ports: InitPlanPorts,
): Promise<InitPlan> {
  const root = resolve(cwd);
  const detection = await ports.detect(root, options.framework);
  if (!detection.ok) {
    const diagnostic = detectionDiagnostic(root, detection, options);
    return emptyPlan(root, failureFramework(detection, options), [diagnostic]);
  }

  let project: InitProjectSnapshot;
  try {
    project = await ports.snapshot(root, detection.framework);
  } catch (error) {
    const diagnostic = diagnosticFromThrown(error);
    if (diagnostic === null) throw error;
    return emptyPlan(root, detection.framework, [diagnostic]);
  }

  const shared = planShared(project, detection.framework);
  const adapterResults = detection.framework.adapters.map((framework) =>
    ports.adapter(framework).plan({ framework, project, aliases: INIT_ALIASES }),
  );
  const diagnostics = [
    ...shared.diagnostics,
    ...adapterResults.flatMap((result) => result.diagnostics),
  ];
  const instructions = [
    ...shared.instructions,
    ...adapterResults.flatMap((result) => result.instructions),
  ].sort((a, b) => compare(a.code, b.code) || compare(a.path ?? "", b.path ?? ""));
  const proposals = [...shared.files, ...adapterResults.flatMap((result) => result.files)];
  const dependencies = wantedDependencies(project);
  const packageCollision = packageJsonInstallCollision(root, proposals, dependencies);
  if (packageCollision !== null) diagnostics.push(packageCollision);

  const files = plannedFiles(root, proposals, ports, diagnostics);
  const settledDiagnostics = sortDiagnostics(downgradeForced(diagnostics, options.force === true));
  if (settledDiagnostics.some((diagnostic) => isBlocking(diagnostic, false))) {
    return {
      ...emptyPlan(root, detection.framework, settledDiagnostics),
      instructions,
    };
  }

  let packageManager = options.packageManager ?? null;
  if (dependencies.length > 0 && packageManager === null) {
    packageManager = await ports.detectPackageManager(root);
  }
  if (dependencies.length > 0 && packageManager === null) {
    settledDiagnostics.push(
      diag(
        "no-package-manager",
        `${dependencies.length} init dependencies would have to be installed, and no package manager could be detected in ${root}. Declare package.json#packageManager, add a known lockfile, or pass --pm.`,
      ),
    );
    return {
      ...emptyPlan(root, detection.framework, settledDiagnostics),
      instructions,
    };
  }

  const installCommand =
    dependencies.length > 0 && packageManager !== null
      ? ports.installCommand(dependencies, packageManager)
      : null;

  return {
    version: 1,
    root,
    framework: detection.framework,
    files,
    dependencies,
    packageManager: dependencies.length > 0 ? packageManager : null,
    installCommand,
    instructions,
    diagnostics: settledDiagnostics,
    ok: true,
  };
}

export const planInit = planInitCore satisfies PlanInitFn;
