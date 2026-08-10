/**
 * The refusal contract, as data.
 *
 * §1 of the build plan states every code's severity, forceability, phase and
 * exit code in one table. `DIAGNOSTIC_CODES` below is that table — the single
 * place those three facts live, so a gate cannot quietly disagree with the
 * documented contract by passing its own severity at a call site.
 *
 * `Record<DiagnosticCode, …>` is deliberate: adding a member to the union in
 * `types.ts` without giving it a row here is a compile error, which is the only
 * mechanism that keeps the table complete as the enum grows.
 *
 * Pure — no fs, no network, no env, no clock.
 */
import type { CanonicalId, Diagnostic, DiagnosticAction, DiagnosticCode, Severity } from "./types";

export interface DiagnosticSpec {
  severity: Severity;
  /** Whether `--force` may downgrade this error to a warning. Meaningless on a
   *  `warn`/`info` row, where it is always false. */
  forceable: boolean;
  /**
   * Process exit code when this diagnostic blocks the run. `0` on every
   * non-blocking row.
   *
   * Exit 2 is reserved for usage/config problems. `no-package-manager` and
   * W6's framework/config detection failures are properties of the project or
   * command selection, not verdicts about an install payload.
   */
  exit: 0 | 1 | 2;
}

/** Rows appear in the order of §1's refusal table so the two can be diffed. */
export const DIAGNOSTIC_CODES: Record<DiagnosticCode, DiagnosticSpec> = {
  // ---- blocking, non-forceable ---------------------------------------------
  /** Two distinct ids, one destination, within a single run (D8). Non-forceable
   *  because `--force` would be the prompt with the question removed: `@house`'s
   *  EmptyStateProps is {title, description, icon, action} and `@base`'s is
   *  {title}, so there is no correct answer to offer. The durable remedy is a
   *  `resolutions` entry. */
  "target-collision": { severity: "error", forceable: false, exit: 1 },
  /** The cross-RUN half of the same hazard: this destination is recorded in
   *  manteen.lock.json as owned by a different item. Non-forceable for
   *  `target-collision`'s reason — the two implementations have different props,
   *  so there is no correct answer a flag could stand in for. The durable remedy
   *  is a `resolutions` entry, and it is printed paste-ready. */
  "receipt-collision": { severity: "error", forceable: false, exit: 1 },
  "target-escapes-root": { severity: "error", forceable: false, exit: 1 },
  /** `.manteen/` is Manteen's transactional state tree, never registry output. */
  "target-reserved": { severity: "error", forceable: false, exit: 1 },
  /** registry:style / base / theme / item at file level (D22). */
  "target-refused-type": { severity: "error", forceable: false, exit: 1 },
  /** No `content` on a wire file. There is no second channel to fetch bytes
   *  from, so the alternative is writing an empty file over the user's
   *  component. */
  "file-no-content": { severity: "error", forceable: false, exit: 1 },
  /** Forceable because this code covers two cases with different owners. An
   *  unmergeable BASE is the user's own file and they can fix it; an unmergeable
   *  incoming FRAGMENT is a registry author's mistake, and leaving the consumer
   *  with a non-forceable exit 1 makes someone else's typo unclearable. Forcing
   *  drops every theme contribution for the run — the fold returns no theme at
   *  all — which is blunt, but it is an explicit user action and the diagnostic
   *  still prints. */
  "theme-base-unmergeable": { severity: "error", forceable: true, exit: 1 },
  "unknown-namespace": { severity: "error", forceable: false, exit: 1 },
  "missing-env": { severity: "error", forceable: false, exit: 1 },
  "fetch-failed": { severity: "error", forceable: false, exit: 1 },
  "wire-invalid": { severity: "error", forceable: false, exit: 1 },
  "depth-exceeded": { severity: "error", forceable: false, exit: 1 },
  "node-limit": { severity: "error", forceable: false, exit: 1 },
  "response-too-large": { severity: "error", forceable: false, exit: 1 },
  /** D26-D27: the client intentionally implements only package-level import
   * declarations from the wire css surface. */
  "css-unsupported": { severity: "error", forceable: false, exit: 1 },
  /** A package stylesheet must be present at consumer runtime. */
  "css-dependency-missing": { severity: "error", forceable: false, exit: 1 },
  /** No destination may be guessed for a composed, project-owned artifact. */
  "global-styles-unconfigured": { severity: "error", forceable: false, exit: 1 },
  /** Unknown pre-existing bytes cannot be silently adopted as Manteen-owned. */
  "global-styles-uninitialized": { severity: "error", forceable: false, exit: 1 },
  /** §6: a `.ts`/`.tsx` item planned into a project whose only config is
   *  `jsconfig.json`. Non-forceable on purpose — the honest escape hatch is
   *  adding a real `tsconfig.json` with the same `paths` and re-running,
   *  which is a config edit `--force` cannot stand in for; there is no
   *  meaning of "force past" a file that would ship with nothing to resolve
   *  its syntax against. */
  "jsconfig-typescript-unsupported": { severity: "error", forceable: false, exit: 1 },
  /** Update cannot trust a missing, unreadable, or hash-mismatched ancestor. */
  "merge-base-unreadable": { severity: "error", forceable: false, exit: 1 },
  /** Both local and upstream touched an overlapping region, or update found an
   *  occupied destination with no prior ownership record. */
  "update-conflict": { severity: "error", forceable: false, exit: 1 },
  /** The project opted into update verification, but its root package.json
   *  cannot supply one exact string definition for every configured script. */
  "verification-script-unavailable": { severity: "error", forceable: false, exit: 1 },
  /** An automation caller pinned a different read-only preview. Never forceable:
   *  the explicit digest is the caller's mutation authority. */
  "plan-mismatch": { severity: "error", forceable: false, exit: 1 },
  // D42. Exact, non-forceable file-pruning authority and filesystem boundary.
  "remove-file-unowned": { severity: "error", forceable: false, exit: 1 },
  "remove-file-still-published": { severity: "error", forceable: false, exit: 1 },
  "remove-file-reassigned": { severity: "error", forceable: false, exit: 1 },
  "remove-file-artifact": { severity: "error", forceable: false, exit: 1 },
  "remove-adapted-file": { severity: "error", forceable: false, exit: 1 },
  "remove-path-unsupported": { severity: "error", forceable: false, exit: 1 },

  // ---- blocking, forceable --------------------------------------------------
  /** Ranges provably disjoint (`semver.intersects` false, D10). */
  "dependency-range-conflict": { severity: "error", forceable: true, exit: 1 },
  /** State `found` and `satisfies` false (D11). Only `found` refuses. */
  "mantine-version-mismatch": { severity: "error", forceable: true, exit: 1 },
  /** Forcing past this discards every prior ownership record AND leaves the
   *  cross-run check off for the run, because `buildIndex` returns an empty map
   *  for an unreadable state. The message must say both. */
  "receipt-unreadable": { severity: "error", forceable: true, exit: 1 },
  /** Explicit ownership makes force precise: restore generated imports while
   * leaving the later host stylesheet untouched (D31). */
  "global-styles-drift": { severity: "error", forceable: true, exit: 1 },

  // ---- blocking, exit 2 -----------------------------------------------------
  "no-package-manager": { severity: "error", forceable: false, exit: 2 },
  "init-framework-unrecognized": { severity: "error", forceable: false, exit: 2 },
  "init-framework-ambiguous": { severity: "error", forceable: false, exit: 2 },
  "init-framework-mismatch": { severity: "error", forceable: false, exit: 2 },
  "init-config-conflict": { severity: "error", forceable: false, exit: 2 },

  // ---- W6 transform refusals -----------------------------------------------
  "init-source-unsupported": { severity: "error", forceable: false, exit: 1 },
  "init-postcss-unsupported": { severity: "error", forceable: false, exit: 1 },
  "init-path-escapes-root": { severity: "error", forceable: false, exit: 1 },

  // ---- context-dependent ----------------------------------------------------
  /**
   * The row here is the REFUSAL case: non-interactive with neither
   * `--overwrite` nor `--no-overwrite`. Every other case is a decision the user
   * still gets to make, so the emitting gate passes an explicit lower severity.
   *
   * `forceable: false` is not an oversight. §1's table spells the escape hatch
   * as "via `--overwrite`", and `Diagnostic.forceable` encodes one thing only:
   * whether `--force` downgrades it. `--overwrite` (and `--yes`, which implies
   * it) works by changing what the gate emits, not by downgrading it.
   */
  "destination-exists": { severity: "error", forceable: false, exit: 1 },

  /**
   * Not in §1's table — it comes from D20's "requires fails closed" and Phase
   * 2's assertion that `meta.mantine.requires = 12345` produces this at error
   * severity. `requires` is the safety mechanism that keeps a v9-only component
   * off a v8 install, so a malformed one is refused rather than dropped.
   */
  "meta-invalid-requires": { severity: "error", forceable: false, exit: 1 },
  /**
   * Also not in §1's table. A bare `registryDependencies` entry declared by an
   * item that has no namespace to borrow (a `url:` item). §5a resolution 5's
   * parent-relative rule has no parent here and we never fall back to
   * ui.shadcn.com, so there is nothing left to try.
   */
  "bare-dep-unresolvable": { severity: "error", forceable: false, exit: 1 },

  // ---- warnings -------------------------------------------------------------
  "mantine-version-unknown": { severity: "warn", forceable: false, exit: 0 },
  "mantine-malformed-metadata": { severity: "warn", forceable: false, exit: 0 },
  /** §5a resolution 4: the version gate reads @mantine/core only, so an
   *  unsatisfied non-core `@mantine/*` range is said out loud rather than
   *  passing in silence. */
  "mantine-non-core-unsatisfied": { severity: "warn", forceable: false, exit: 0 },
  "provider-missing": { severity: "warn", forceable: false, exit: 0 },
  "dependency-range-narrowed": { severity: "warn", forceable: false, exit: 0 },
  "bare-dep-assumed-local": { severity: "warn", forceable: false, exit: 0 },
  /** Cycles are legal TypeScript — we copy files, we do not evaluate them — so
   *  Kahn's algorithm emits SCC members in id order and warns (D25). */
  "dependency-cycle": { severity: "warn", forceable: false, exit: 0 },
  /** Warn, not info: a resolution substitutes a differently-typed
   *  implementation behind an import specifier the user already authored (D9).
   *  Also emitted on an authorised cross-run ownership transfer, where nothing
   *  else fires — the resolver rewrites nothing, and `--overwrite` in CI has no
   *  prompt to carry the message. */
  "resolution-applied": { severity: "warn", forceable: false, exit: 0 },
  "name-mismatch": { severity: "warn", forceable: false, exit: 0 },
  /** A `meta.mantine` key we act on was malformed and dropped. Fails open by
   *  design for the three keys that are documentation rather than safety. */
  "meta-degraded": { severity: "warn", forceable: false, exit: 0 },
  /** `prefer: "base"` kept the user's leaf. Nothing was lost. */
  "theme-conflict": { severity: "warn", forceable: false, exit: 0 },
  /** The receipt records a different item here but the file is gone. Ownership
   *  transfers and the run proceeds — nothing is being replaced, so refusing
   *  would be theatre. */
  "receipt-stale": { severity: "warn", forceable: false, exit: 0 },

  // ---- informational --------------------------------------------------------
  "styles-api": { severity: "info", forceable: false, exit: 0 },
  /** Same item, but the file changed after manteen wrote it. Blocks nothing —
   *  add's `destination-exists` gates replacement, while update uses the
   *  pristine base. It exists so either surface can attribute the local side. */
  "receipt-drift": { severity: "info", forceable: false, exit: 0 },
};

export interface DiagnosticExtras {
  items?: CanonicalId[];
  path?: string;
  actions?: DiagnosticAction[];
  manualRationale?: string;
  /**
   * Override the table's severity. Exactly one code needs this
   * (`destination-exists`, whose severity depends on whether a decision path
   * exists); anything else reaching for it is a sign the table is wrong.
   */
  severity?: Severity;
  forceable?: boolean;
}

/**
 * Build a diagnostic, taking severity and forceability from the contract table.
 *
 * `items` and `path` are omitted rather than set to `undefined` when absent, so
 * two diagnostics that mean the same thing serialise the same way — `--json`
 * output and snapshot assertions both depend on it.
 */
export function diag(
  code: DiagnosticCode,
  message: string,
  extras: DiagnosticExtras = {},
): Diagnostic {
  const spec = DIAGNOSTIC_CODES[code];
  return {
    code,
    severity: extras.severity ?? spec.severity,
    message,
    ...(extras.items ? { items: extras.items } : {}),
    ...(extras.path !== undefined ? { path: extras.path } : {}),
    forceable: extras.forceable ?? spec.forceable,
    ...(extras.actions !== undefined ? { actions: extras.actions } : {}),
    ...(extras.manualRationale !== undefined ? { manualRationale: extras.manualRationale } : {}),
  };
}

/** Whether this diagnostic stops the run, given the `--force` flag. */
export function isBlocking(diagnostic: Diagnostic, force: boolean): boolean {
  return diagnostic.severity === "error" && !(diagnostic.forceable && force);
}

/**
 * Apply `--force`.
 *
 * `--force` never *silences* a diagnostic; it flips a forceable error to a
 * warning, and both the printed report and `--json` still carry it. Returns a
 * new array — the caller's list is the record of what the gates actually said.
 */
export function downgradeForced(diagnostics: readonly Diagnostic[], force: boolean): Diagnostic[] {
  if (!force) return [...diagnostics];
  return diagnostics.map((d) =>
    d.severity === "error" && d.forceable ? { ...d, severity: "warn" as const } : d,
  );
}

/**
 * Exit code for a set of diagnostics: 0 when nothing blocks, 2 when a blocking
 * diagnostic is a usage/config problem, 1 otherwise.
 *
 * 2 wins a tie with 1 because it names the thing the user has to fix first —
 * a refused install is downstream of having no package manager at all.
 */
export function blockingExitCode(diagnostics: readonly Diagnostic[], force: boolean): 0 | 1 | 2 {
  let code: 0 | 1 | 2 = 0;
  for (const diagnostic of diagnostics) {
    if (!isBlocking(diagnostic, force)) continue;
    const { exit } = DIAGNOSTIC_CODES[diagnostic.code];
    if (exit === 2) return 2;
    if (exit > code) code = exit;
  }
  return code;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/**
 * Deterministic, locale-independent ordering: errors first, then a total order
 * over the fields.
 *
 * Every comparison uses `<` on UTF-16 code units. Never `localeCompare` — its
 * ordering depends on the ambient locale, so the same plan would print in a
 * different order under `LANG=tr_TR.UTF-8` and no snapshot could hold.
 */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (
      compare(a.code, b.code) ||
      compare(a.path ?? "", b.path ?? "") ||
      compare((a.items ?? []).join(","), (b.items ?? []).join(",")) ||
      compare(a.message, b.message)
    );
  });
}

function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
