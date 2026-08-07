/** Pure D42 candidate, selection, and source/base-state classification. */
import { diag } from "../plan/diagnostics";
import type { Diagnostic } from "../plan/types";
import { receiptPathProblem } from "../receipt/path";
import type {
  RemovalCommandOptions,
  RemovalDestinationSnapshot,
  RemovalDiscoveryInput,
  RemovalDiscoveryResult,
  RemovalPathSnapshot,
  RemovalUsageIssue,
  RemoveCandidate,
} from "./types";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function usage(kind: RemovalUsageIssue["kind"], message: string): RemovalUsageIssue {
  return { kind, message, exit: 2 };
}

/** Validate only D42's semantic mode/selection surface; Commander owns unknown flags. */
export function classifyRemovalUsage(options: RemovalCommandOptions): RemovalUsageIssue[] {
  const issues: RemovalUsageIssue[] = [];
  if (!options.upstreamRemoved) {
    issues.push(usage("missing-mode", "remove requires the --upstream-removed mode"));
  }
  if (!options.dryRun && options.files.length === 0) {
    issues.push(
      usage("missing-selection", "a real upstream-removal run requires at least one exact --file"),
    );
  }
  if (options.discardAdapted && options.files.length === 0) {
    issues.push(
      usage(
        "meaningless-discard-adapted",
        "--discard-adapted requires at least one selected --file",
      ),
    );
  }

  const seen = new Set<string>();
  for (const file of options.files) {
    if (receiptPathProblem(file) !== null) {
      issues.push(
        usage(
          "invalid-file",
          `--file must be an exact POSIX root-relative receipt destination: ${file}`,
        ),
      );
    }
    if (seen.has(file)) {
      issues.push(usage("duplicate-file", `--file was repeated: ${file}`));
    }
    seen.add(file);
  }
  return issues;
}

function snapshotMap(
  snapshots: readonly RemovalDestinationSnapshot[],
): ReadonlyMap<string, RemovalDestinationSnapshot> {
  const result = new Map<string, RemovalDestinationSnapshot>();
  for (const snapshot of snapshots) {
    if (result.has(snapshot.destination)) {
      throw new Error(`duplicate removal snapshot for ${snapshot.destination}`);
    }
    result.set(snapshot.destination, snapshot);
  }
  return result;
}

function supportedSnapshot(
  snapshot: RemovalPathSnapshot,
  label: "source" | "base",
  destination: string,
  itemId: string,
): Diagnostic | null {
  if (snapshot.kind !== "unsupported") return null;
  return diag(
    "remove-path-unsupported",
    `${label} state for ${destination} cannot be journaled exactly: ${snapshot.reason}`,
    { path: destination, items: [itemId] },
  );
}

function candidateFrom(
  itemId: string,
  destination: string,
  snapshot: RemovalDestinationSnapshot,
  baseSha256: string,
  selected: boolean,
): RemoveCandidate {
  if (snapshot.source.kind === "unsupported" || snapshot.base.kind === "unsupported") {
    throw new Error(`cannot classify unsupported removal snapshot for ${destination}`);
  }
  const state =
    snapshot.source.kind === "missing"
      ? "missing"
      : snapshot.source.sha256 === baseSha256
        ? "unchanged"
        : "adapted";
  const base =
    snapshot.base.kind === "missing"
      ? "missing"
      : snapshot.base.sha256 === baseSha256
        ? "present"
        : "corrupt";
  return {
    itemId,
    destination,
    state,
    base,
    selected,
    discardAdaptedRequired: state === "adapted",
  };
}

/**
 * Discover only exact receipt-owner/destination omissions. This function never
 * sees source paths or contents, so rename, text-similarity, and AST inference
 * are structurally unavailable.
 */
export function discoverUpstreamRemovals(input: RemovalDiscoveryInput): RemovalDiscoveryResult {
  const usageIssues = classifyRemovalUsage(input.options);
  if (usageIssues.length > 0) {
    return { ok: false, candidates: [], diagnostics: [], usage: usageIssues };
  }

  const resolutionDiagnostics = [...(input.resolutionDiagnostics ?? [])];
  if (resolutionDiagnostics.some((entry) => entry.severity === "error")) {
    return {
      ok: false,
      candidates: [],
      diagnostics: resolutionDiagnostics,
      usage: [],
    };
  }

  const currentById = new Map<string, ReadonlySet<string>>();
  const currentClaims = new Map<string, Set<string>>();
  for (const item of input.currentItems) {
    if (currentById.has(item.id)) throw new Error(`duplicate resolved removal item ${item.id}`);
    const destinations = new Set(item.ordinaryDestinations);
    currentById.set(item.id, destinations);
    for (const destination of destinations) {
      const owners = currentClaims.get(destination) ?? new Set<string>();
      owners.add(item.id);
      currentClaims.set(destination, owners);
    }
  }
  for (const item of input.receipt.items) {
    if (!currentById.has(item.id)) {
      throw new Error(`removal graph is incomplete for receipt item ${item.id}`);
    }
  }

  const recordedOwners = new Map<string, { itemId: string; baseSha256: string }>();
  for (const item of input.receipt.items) {
    for (const file of item.files) {
      recordedOwners.set(file.destination, {
        itemId: item.id,
        baseSha256: file.baseSha256,
      });
    }
  }

  const artifacts = new Set(input.currentArtifactDestinations);
  if (input.receipt.theme !== null) artifacts.add(input.receipt.theme.destination);
  if (input.receipt.styles !== null) artifacts.add(input.receipt.styles.destination);
  const selected = new Set(input.options.files);
  const snapshots = snapshotMap(input.snapshots);
  const diagnostics = [...resolutionDiagnostics];
  const candidates: RemoveCandidate[] = [];

  for (const item of input.receipt.items) {
    const sameItemDestinations = currentById.get(item.id);
    if (sameItemDestinations === undefined) continue; // guarded above; keeps narrowing exact
    for (const file of item.files) {
      const destination = file.destination;
      if (artifacts.has(destination)) continue;
      if (sameItemDestinations.has(destination)) continue;
      const otherOwners = [...(currentClaims.get(destination) ?? [])].filter(
        (owner) => owner !== item.id,
      );
      if (otherOwners.length > 0) continue;

      const state = snapshots.get(destination);
      if (state === undefined) {
        throw new Error(`missing removal snapshot for ${destination}`);
      }
      const sourceProblem = supportedSnapshot(state.source, "source", destination, item.id);
      const baseProblem = supportedSnapshot(state.base, "base", destination, item.id);
      if (sourceProblem !== null) diagnostics.push(sourceProblem);
      if (baseProblem !== null) diagnostics.push(baseProblem);
      if (sourceProblem !== null || baseProblem !== null) continue;

      const candidate = candidateFrom(
        item.id,
        destination,
        state,
        file.baseSha256,
        selected.has(destination),
      );
      candidates.push(candidate);
      if (candidate.selected && candidate.state === "adapted" && !input.options.discardAdapted) {
        diagnostics.push(
          diag(
            "remove-adapted-file",
            `${destination} differs from pristine upstream; repeat the exact selection with --discard-adapted to remove it`,
            { path: destination, items: [item.id] },
          ),
        );
      }
    }
  }

  for (const destination of selected) {
    const recorded = recordedOwners.get(destination);
    if (artifacts.has(destination)) {
      diagnostics.push(
        diag(
          "remove-file-artifact",
          `${destination} is a theme or managed-styles artifact, not an ordinary removal candidate`,
          {
            path: destination,
            ...(recorded === undefined ? {} : { items: [recorded.itemId] }),
          },
        ),
      );
      continue;
    }
    if (recorded === undefined) {
      diagnostics.push(
        diag(
          "remove-file-unowned",
          `${destination} is not an exact ordinary destination owned by the receipt`,
          { path: destination },
        ),
      );
      continue;
    }
    if (currentById.get(recorded.itemId)?.has(destination)) {
      diagnostics.push(
        diag("remove-file-still-published", `${recorded.itemId} still publishes ${destination}`, {
          path: destination,
          items: [recorded.itemId],
        }),
      );
      continue;
    }
    const otherOwners = [...(currentClaims.get(destination) ?? [])]
      .filter((owner) => owner !== recorded.itemId)
      .sort(compare);
    if (otherOwners.length > 0) {
      diagnostics.push(
        diag(
          "remove-file-reassigned",
          `${destination} is now claimed by ${otherOwners.join(", ")}`,
          { path: destination, items: [recorded.itemId, ...otherOwners] },
        ),
      );
    }
  }

  candidates.sort(
    (left, right) =>
      compare(left.destination, right.destination) || compare(left.itemId, right.itemId),
  );
  if (diagnostics.some((entry) => entry.code === "remove-path-unsupported")) {
    return { ok: false, candidates: [], diagnostics, usage: [] };
  }
  return {
    ok: !diagnostics.some((entry) => entry.severity === "error"),
    candidates,
    diagnostics,
    usage: [],
  };
}
