/**
 * Production D42 removal planning: read and validate the receipt, resolve the
 * exact all-receipt-roots graph, snapshot candidate paths, and project bytes.
 * Reads disk/network; never writes.
 */

import { detectPackageManager } from "nypm";
import { loadEnv } from "../config/load";
import type { LoadedConfig } from "../config/types";
import { checkCollisions } from "../gates/collision";
import { checkReservedTargets } from "../gates/reserved";
import type { InventoryNote } from "../inventory/types";
import { diag, sortDiagnostics } from "../plan/diagnostics";
import { createItemLoader } from "../plan/index";
import { resolve as resolveGraph } from "../plan/resolve";
import { manteenStateIsGitIgnored } from "../plan/state-ignored";
import type {
  Diagnostic,
  DiagnosticCode,
  Receipt,
  ReceiptState,
  ResolvePorts,
} from "../plan/types";
import { RECEIPT_VERSION } from "../plan/types";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { basePathFor, fromReceiptPath, isManteenStatePath, toReceiptPath } from "../receipt/path";
import { readReceipt, receiptPathFor } from "../receipt/read";
import { planVerification } from "../verification/plan";
import { discoverUpstreamRemovals } from "./discovery";
import { projectRemovalReceipt, serializeProjectedRemovalReceipt } from "./receipt-projection";
import { snapshotRemovalPath } from "./snapshot";
import type {
  RemovalCommandOptions,
  RemovalDestinationSnapshot,
  RemovalPlan,
  RemovalResolvedItem,
} from "./types";
import { createRemovalItemValidator } from "./validate-item";

/** Only facts needed to prove exact current ordinary-file ownership. */
const REMOVAL_GRAPH_DIAGNOSTICS: ReadonlySet<DiagnosticCode> = new Set([
  "unknown-namespace",
  "missing-env",
  "fetch-failed",
  "wire-invalid",
  "file-no-content",
  "target-collision",
  "target-escapes-root",
  "target-reserved",
  "target-refused-type",
  "bare-dep-unresolvable",
  "depth-exceeded",
  "node-limit",
  "response-too-large",
  "resolution-applied",
  "dependency-cycle",
  "name-mismatch",
]);

const EMPTY_RECEIPT: Receipt = {
  lockfileVersion: RECEIPT_VERSION,
  items: [],
  theme: null,
  styles: null,
};

export async function planRemoval(
  config: LoadedConfig,
  options: RemovalCommandOptions,
): Promise<RemovalPlan> {
  const root = config.root;
  const stateIgnored = manteenStateIsGitIgnored(root);
  const read = createReceiptReader();
  const validate = createReceiptValidator();
  const receiptPath = readReceiptPath(root, read, validate);

  if (receiptPath.kind === "unsupported") {
    const diagnostic = diag(
      "remove-path-unsupported",
      `manteen.lock.json cannot be used for exact removal rollback: ${receiptPath.reason}`,
      { path: "manteen.lock.json" },
    );
    return blockedPlan(root, options, receiptPath.path, null, "", diagnostic, stateIgnored);
  }

  const receiptState = receiptPath.state;
  if (receiptState.present && !receiptState.ok) {
    const diagnostic = unreadableReceiptDiagnostic(receiptState);
    return blockedPlan(
      root,
      options,
      receiptState.path,
      receiptState.sha256,
      receiptState.raw,
      diagnostic,
      stateIgnored,
    );
  }

  const receipt = receiptState.present ? receiptState.receipt : EMPTY_RECEIPT;
  const notes = receiptState.present ? [] : [noReceiptNote()];
  let graphDiagnostics: Diagnostic[] = [];
  let currentItems: RemovalResolvedItem[] = [];

  if (receipt.items.length > 0) {
    const env = loadEnv(root);
    const ports: ResolvePorts = {
      load: createItemLoader(config, env),
      target: config.target,
      env,
    };
    // Receipt roots stay exact; D9 resolutions still apply to transitive refs.
    const graph = await resolveGraph(
      ports,
      config,
      receipt.items.map((item) => item.id),
      createRemovalItemValidator(),
      { resolveRootRefs: false },
    );
    graphDiagnostics = sortDiagnostics(
      [
        ...graph.diagnostics,
        ...checkCollisions(graph.files, root),
        ...checkReservedTargets(graph.files, root),
      ].filter((diagnostic) => REMOVAL_GRAPH_DIAGNOSTICS.has(diagnostic.code)),
    );
    currentItems = graph.items.map((item) => ({
      id: item.id,
      ordinaryDestinations: item.files.map((file) => toReceiptPath(file.destination, root)),
    }));
  }

  const snapshots = snapshotReceiptFiles(receipt, root);
  const discovery = discoverUpstreamRemovals({
    receipt,
    currentItems,
    currentArtifactDestinations: [config.themeDestination, config.stylesDestination]
      .filter((path): path is string => path !== null)
      .map((path) => toReceiptPath(path, root)),
    snapshots,
    options,
    resolutionDiagnostics: graphDiagnostics,
  });

  const selected = discovery.candidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => ({ itemId: candidate.itemId, destination: candidate.destination }));
  const projection = projectRemovalReceipt(receipt, selected);
  if (!projection.ok) {
    throw new Error(
      `removal plan projection lost ${projection.selection.itemId} ${projection.selection.destination} (${projection.reason})`,
    );
  }

  const snapshotByDestination = new Map(
    snapshots.map((snapshot) => [snapshot.destination, snapshot]),
  );
  const removals = selected.map((selection) => {
    const snapshot = snapshotByDestination.get(selection.destination);
    if (snapshot === undefined) {
      throw new Error(`removal plan has no snapshot for ${selection.destination}`);
    }
    if (snapshot.source.kind === "unsupported" || snapshot.base.kind === "unsupported") {
      throw new Error(`removal plan selected unsupported path state for ${selection.destination}`);
    }
    const sourcePath = fromReceiptPath(selection.destination, root);
    return {
      ...selection,
      source: {
        path: sourcePath,
        sha256: snapshot.source.kind === "regular" ? snapshot.source.sha256 : null,
      },
      base: {
        path: basePathFor(sourcePath, root),
        sha256: snapshot.base.kind === "regular" ? snapshot.base.sha256 : null,
      },
    };
  });

  const operationScripts =
    options.verify === false ? null : (config.raw.verification?.remove ?? null);
  let verification: RemovalPlan["verification"] = null;
  const verificationDiagnostics: Diagnostic[] = [];
  if (operationScripts !== null) {
    const manager = await detectPackageManager(root, {
      includeParentDirs: false,
      ignoreArgv: true,
    });
    if (manager == null) {
      verificationDiagnostics.push(
        diag(
          "no-package-manager",
          `Remove verification is configured, and no package manager could be detected in ${root}. Declare package.json.packageManager or use --no-verify.`,
        ),
      );
    } else {
      const result = planVerification(
        "remove",
        root,
        operationScripts,
        manager.name,
        undefined,
        config.raw.verification?.timeoutMs,
      );
      verification = result.verification;
      verificationDiagnostics.push(...result.diagnostics);
    }
  }
  const diagnostics = sortDiagnostics([
    ...(discovery.diagnostics as readonly Diagnostic[]),
    ...verificationDiagnostics,
  ]);
  return {
    root,
    ok: discovery.ok && !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    dryRun: options.dryRun,
    candidates: discovery.candidates,
    removals,
    receipt: {
      path: receiptState.path,
      sha256: receiptState.present ? receiptState.sha256 : null,
      projectedText: projection.changed
        ? serializeProjectedRemovalReceipt(projection.receipt)
        : receiptState.present
          ? receiptState.raw
          : "",
      projectedChange: projection.changed,
    },
    diagnostics,
    notes,
    stateIgnored,
    verification,
  };
}

function snapshotReceiptFiles(receipt: Receipt, root: string): RemovalDestinationSnapshot[] {
  const projectReceiptPath = receiptPathFor(root);
  return receipt.items.flatMap((item) =>
    item.files.map((file) => {
      const sourcePath = fromReceiptPath(file.destination, root);
      if (sourcePath === projectReceiptPath || isManteenStatePath(sourcePath, root)) {
        return {
          destination: file.destination,
          source: {
            kind: "unsupported" as const,
            reason: "the recorded source collides with Manteen-owned state",
          },
          base: { kind: "missing" as const },
        };
      }
      return {
        destination: file.destination,
        source: snapshotRemovalPath(sourcePath, root),
        base: snapshotRemovalPath(basePathFor(sourcePath, root), root),
      };
    }),
  );
}

type ReceiptPathRead =
  | { kind: "ok"; state: ReceiptState }
  | { kind: "unsupported"; path: string; reason: string };

function readReceiptPath(
  root: string,
  read: ReturnType<typeof createReceiptReader>,
  validate: ReturnType<typeof createReceiptValidator>,
): ReceiptPathRead {
  const path = receiptPathFor(root);
  const snapshot = snapshotRemovalPath(path, root);
  if (snapshot.kind === "unsupported") {
    return { kind: "unsupported", path, reason: snapshot.reason };
  }

  const state = readReceipt(root, read, validate);
  if (snapshot.kind === "regular" && (!state.present || state.sha256 !== snapshot.sha256)) {
    return { kind: "unsupported", path, reason: "the receipt changed while it was being read" };
  }
  if (snapshot.kind === "missing" && state.present) {
    return { kind: "unsupported", path, reason: "the receipt appeared while it was being read" };
  }
  return { kind: "ok", state };
}

function blockedPlan(
  root: string,
  options: RemovalCommandOptions,
  receiptPath: string,
  receiptSha256: string | null,
  receiptText: string,
  diagnostic: Diagnostic,
  stateIgnored: boolean,
): RemovalPlan {
  return {
    root,
    ok: false,
    dryRun: options.dryRun,
    candidates: [],
    removals: [],
    receipt: {
      path: receiptPath,
      sha256: receiptSha256,
      projectedText: receiptText,
      projectedChange: false,
    },
    diagnostics: [diagnostic],
    notes: [],
    stateIgnored,
  };
}

function unreadableReceiptDiagnostic(
  state: Extract<ReceiptState, { present: true; ok: false }>,
): Diagnostic {
  const detail =
    state.reason === "future-version"
      ? `lockfileVersion ${state.sawVersion ?? "?"} is newer than ${RECEIPT_VERSION}`
      : state.detail;
  return diag(
    "receipt-unreadable",
    `manteen.lock.json cannot prove upstream removal ownership: ${detail}. Repair or upgrade it; this command never forces past receipt state.`,
    { path: state.path },
  );
}

function noReceiptNote(): InventoryNote {
  return {
    code: "no-receipt",
    message:
      "manteen.lock.json does not exist, so there are no installed ordinary files to inspect for upstream removal. Run `manteen add <item>` first.",
  };
}
