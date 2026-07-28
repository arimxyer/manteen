/**
 * `plan()` — composition. The one module that wires concrete ports into the pure
 * resolver, does every filesystem read the gates need, and hands the result to
 * the aggregator.
 *
 * IMPURE by the §1 convention, and impure in exactly one direction: **`plan()`
 * may READ disk and the network; it never writes.** Everything it reads is
 * turned into a parameter before it reaches a module labelled pure — the
 * resolver gets an `ItemLoader`, the gates get hashes and an index, and neither
 * ever calls `readFileSync` itself.
 *
 * Reading order matters in one place and only one:
 *
 *   resolve()  ->  hash every planned destination ONCE  ->  gates  ->  aggregate
 *
 * The single hash pass is load-bearing. The same `ExistingHashes` map feeds
 * `PlannedFile.existing`, the disposition computation and `gates/receipt.ts`, so
 * the three can never disagree about what is on disk — and every key a consumer
 * looks up is present, which is what makes `null` (absent) distinguishable from
 * `undefined` (asked about a destination this pass never saw).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { addDependencyCommand, detectPackageManager, type PackageManagerName } from "nypm";
import { satisfies } from "semver";

import { loadEnv } from "../config/load";
import type { LoadedConfig } from "../config/types";
import { checkCollisions } from "../gates/collision";
import { checkReceipt } from "../gates/receipt";
import { aggregate } from "../gates/report";
import { installedVersion, resolveMantineInstall } from "../gates/resolve-mantine-install";
import { hashFileBytes } from "../apply/preflight";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { toReceiptPath } from "../receipt/path";
import { buildIndex, ownerOf, readReceipt } from "../receipt/read";
import { diag } from "./diagnostics";
import { createFileLoader, isFileUrl } from "./loader-local";
import { resolve as resolveGraph } from "./resolve";
import { RECEIPT_VERSION } from "./types";
import type {
  CanonicalId,
  Diagnostic,
  Disposition,
  ExistingHashes,
  ItemLoader,
  Plan,
  PlanFn,
  PlanItem,
  PlanOptions,
  PlannedDependency,
  PlannedFile,
  ReceiptState,
  ResolvedItem,
  ResolvePorts,
} from "./types";

/**
 * Never reached while `plan.ok` is false, which is the only state it can be in
 * when this is used: `no-package-manager` is a non-forceable error. `Plan
 * .packageManager` is non-nullable because every path that reads it has already
 * passed that gate, and widening the frozen contract type to carry a state the
 * contract says cannot escape would push the check onto every reader.
 */
const NO_PACKAGE_MANAGER = "npm" as PackageManagerName;

export const plan = planImpl satisfies PlanFn;

async function planImpl(
  config: LoadedConfig,
  refs: string[],
  options: PlanOptions,
): Promise<Plan> {
  const root = config.root;
  const force = options.force === true;

  // Mutates `process.env` (see `loadEnv`), and is the ONLY place that reads it.
  // Everything downstream takes the returned map as a parameter — a module that
  // reaches for `process.env` itself is unreachable from a test that sets one.
  const env = loadEnv(root);

  const ports: ResolvePorts = { load: createLoader(), target: config.target, env };
  const graph = await resolveGraph(ports, config, refs);

  const diagnostics: Diagnostic[] = [...graph.diagnostics];
  diagnostics.push(...checkCollisions(graph.files, root));

  // ---- the receipt (§5a) ----------------------------------------------------
  // Read once, here. `apply()` receives the parsed state on the Plan and re-reads
  // only to hash-verify in preflight, so a concurrent edit cannot make plan and
  // apply disagree about what the receipt said.
  const receipt = readReceipt(root, createReceiptReader(), createReceiptValidator());
  if (receipt.present && !receipt.ok) diagnostics.push(receiptUnreadable(receipt));

  // Empty for an absent receipt AND for an unreadable one, which is what makes
  // the "no receipt yet" branch structural rather than a convention every
  // consumer has to remember.
  const index = buildIndex(receipt, root);

  // ---- one hash pass over every planned destination -------------------------
  const existing: Map<string, string | null> = new Map();
  for (const file of graph.files) {
    if (!existing.has(file.destination)) existing.set(file.destination, hashFileBytes(file.destination));
  }

  diagnostics.push(
    ...checkReceipt({
      root,
      index,
      files: graph.files.map((file) => ({ itemId: file.itemId, destination: file.destination })),
      items: new Map(graph.items.map((item) => [item.id, { registry: item.namespace }])),
      existing,
      resolutions: config.resolutions,
      themeDestination: config.themeDestination,
    }),
  );

  const items = graph.items.map((item) => toPlanItem(item, existing, index));
  const files = items.flatMap((item) => item.files);
  diagnostics.push(...checkDestinations(files, options, root));

  // ---- dependencies (D17) ---------------------------------------------------
  const deps = filterDependencies(graph.dependencies, root, diagnostics);

  // ---- package manager (D15, D16) -------------------------------------------
  const detected =
    options.packageManager ??
    (
      await detectPackageManager(root, {
        // Explicit rather than defaulted: a stray ancestor lockfile silently
        // deciding the package manager is the failure this guards, and nypm
        // 0.6.9's own JSDoc contradicts the plan's rationale sentence about
        // which way it defaults.
        includeParentDirs: false,
        // The argv fallback regex-matches `process.argv[1]`, so invoking manteen
        // through a path containing `/bun` or `/.npm/_npx/` would fake a
        // detection that has nothing to do with the user's project.
        ignoreArgv: true,
      })
    )?.name;

  if (detected === undefined && deps.length > 0) {
    diagnostics.push(
      diag(
        "no-package-manager",
        // No `path`: it would be the project root, which renders root-relative
        // as the empty string. The message names it instead.
        `${deps.length} npm dependenc${deps.length === 1 ? "y" : "ies"} would have to be installed, and no package manager could be detected in ${root}. nypm reads package.json's \`packageManager\` field and known lock files; declare one, or pass --pm.`,
      ),
    );
  }

  const packageManager = detected ?? NO_PACKAGE_MANAGER;

  // ---- theme ----------------------------------------------------------------
  // Before `aggregate`, not inline in the object literal below: this can emit a
  // diagnostic, and the aggregator is what decides `ok`. Anything pushed after
  // it is silently dropped.
  const theme = foldTheme(config, graph.themeFragments, diagnostics);

  const report = aggregate(diagnostics, force);

  return {
    version: 1,
    root,
    configPath: config.configPath,
    items,
    files,
    dependencies: deps,
    packageManager,
    installCommand: detected === undefined ? null : installCommandFor(detected, deps),
    theme,
    mantine: resolveMantineInstall(root),
    receipt,
    diagnostics: report.diagnostics,
    ok: report.ok,
  };
}

// ---- ports ------------------------------------------------------------------

/**
 * Dispatch on scheme rather than trying one loader and falling back.
 *
 * Node's `fetch` rejects `file:` outright ("not implemented… yet…"), so the two
 * schemes genuinely need different code — and `loader-http.ts` is a later phase.
 * Letting an `http:` registry fall into the file loader produces an ENOENT
 * naming a path the user never wrote; a `fetch-failed` naming the missing module
 * at least says what is going on.
 */
function createLoader(): ItemLoader {
  const file = createFileLoader();
  return async (request) => {
    if (isFileUrl(request.url)) return file(request);
    return {
      ok: false,
      reason: "network",
      redactedUrl: request.redactedUrl,
      detail:
        "manteen cannot fetch over the network yet — src/plan/loader-http.ts has not landed. " +
        "A `file:` registry URL works today.",
    };
  };
}

// ---- resolved -> planned ----------------------------------------------------

function toPlanItem(item: ResolvedItem, existing: ExistingHashes, index: ReturnType<typeof buildIndex>): PlanItem {
  const files: PlannedFile[] = item.files.map((file) => {
    // Of the UTF-8 encoding of the STRING we would write. `existing` hashes RAW
    // BYTES. The two compare equal only because write-files.ts writes with an
    // explicit "utf8" encoding, no BOM and no newline translation.
    const sha256 = createHash("sha256").update(file.content, "utf8").digest("hex");
    const onDisk = existing.get(file.destination) ?? null;
    return {
      ...file,
      sha256,
      existing: onDisk === null ? null : { sha256: onDisk },
      disposition: dispositionFor(sha256, onDisk),
      priorOwner: ownerOf(index, file.destination),
    };
  });

  return { ...item, files };
}

function dispositionFor(planned: string, onDisk: string | null): Disposition {
  if (onDisk === null) return "create";
  return onDisk === planned ? "identical" : "overwrite";
}

// ---- destination-exists -----------------------------------------------------

/**
 * The overwrite question, asked once per destination that genuinely has one.
 *
 * Only `overwrite` reaches here: `create` has nothing to replace and `identical`
 * replaces bytes with the same bytes. The severity is where the whole rule
 * lives — §1's table names ONE refusal case, non-interactive with neither flag,
 * and every other case is a decision the user still gets to make.
 *
 * `forceable` is false and that is not an oversight: `Diagnostic.forceable`
 * encodes whether `--force` downgrades, and the escape here is `--overwrite`
 * (or `--yes`, which implies it), which works by changing what this emits.
 */
function checkDestinations(
  files: readonly PlannedFile[],
  options: PlanOptions,
  root: string,
): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const file of files) {
    if (file.disposition !== "overwrite") continue;

    // Both spellings are named in the message because the refusal case is
    // reached in CI, where the user cannot see a prompt and has to pick one.
    // The destination renders root-relative — an absolute tmpdir is unassertable
    // across machines — while `path` below stays absolute so a reporter joins on
    // it rather than parsing it back out of the prose.
    const attribution = describeOwner(file);
    const message =
      `${toReceiptPath(file.destination, root)} already exists with different content${attribution}. ` +
      `Pass --overwrite to replace it or --no-overwrite to keep it.`;

    if (options.overwrite !== undefined) continue;

    out.push(
      options.interactive
        ? diag("destination-exists", message, {
            items: [file.itemId],
            path: file.destination,
            // Downgraded on purpose: an interactive run asks. The refusal row is
            // the non-interactive one.
            severity: "info",
          })
        : diag("destination-exists", message, { items: [file.itemId], path: file.destination }),
    );
  }

  return out;
}

/** The four true things the prompt can say, and no fifth. */
function describeOwner(file: PlannedFile): string {
  const owner = file.priorOwner;
  if (owner === null) return " and was not installed by manteen";
  const from = owner.registry === null ? "" : ` from ${owner.registry}`;
  if (owner.itemId !== file.itemId) return `, installed by ${owner.itemId}${from}`;
  const drifted = file.existing !== null && file.existing.sha256 !== owner.sha256;
  return drifted
    ? `, installed by ${owner.itemId}${from} and modified since manteen wrote it`
    : `, installed by ${owner.itemId}${from}`;
}

// ---- dependencies (D17) -----------------------------------------------------

/**
 * A dependency is dropped only when BOTH the installed version satisfies the
 * range AND the name is already declared in the consumer's package.json.
 *
 * Filtering on the installed version alone means a hoisted or transitive
 * `@mantine/core` yields written components importing a package the project
 * never declares — the exact "imports packages that were never installed"
 * failure deps-first ordering exists to prevent. Not filtering at all means
 * every install rewrites a consumer's deliberate `9.5.0` pin, because every
 * catalog item declares `@mantine/core@^9`.
 */
function filterDependencies(
  dependencies: readonly PlannedDependency[],
  root: string,
  diagnostics: Diagnostic[],
): PlannedDependency[] {
  const declared = declaredDependencies(root);
  const out: PlannedDependency[] = [];

  for (const dependency of dependencies) {
    const version = installedVersion(dependency.name, root);
    // `includePrerelease` for D11's reason: refusing someone who deliberately
    // opted into `9.0.0-alpha.1` is a semver technicality, not a compatibility
    // fact. `satisfies` returns false on a garbage range rather than throwing.
    const ok =
      version !== null && satisfies(version, dependency.range || "*", { includePrerelease: true });

    // §5a resolution 4: the version gate reads @mantine/core only, so an
    // unsatisfied non-core `@mantine/*` range is said out loud rather than
    // passing in silence. Emitted from the dependency union because the gate has
    // no installed version for a package it does not gate.
    if (
      !ok &&
      version !== null &&
      dependency.name.startsWith("@mantine/") &&
      dependency.name !== "@mantine/core"
    ) {
      diagnostics.push(
        diag(
          "mantine-non-core-unsatisfied",
          `${dependency.name} ${version} is installed and does not satisfy ${dependency.range || "*"}, wanted by ${dependency.wantedBy.join(", ")}. manteen gates @mantine/core only, so this is reported rather than refused.`,
          { items: dependency.wantedBy },
        ),
      );
    }

    if (ok && declared.has(dependency.name)) continue;
    out.push(dependency);
  }

  return out;
}

/** Every name the consumer's own package.json declares, in any of the three fields. */
function declaredDependencies(root: string): ReadonlySet<string> {
  const names = new Set<string>();
  const path = resolvePath(root, "package.json");
  if (!existsSync(path)) return names;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    // An unparseable consumer package.json is not ours to refuse — npm will say
    // so far more clearly. Treating it as "declares nothing" errs toward
    // installing, which is the safe direction.
    return names;
  }

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const block = parsed[field];
    if (typeof block !== "object" || block === null) continue;
    // `Object.keys`, never `for…in`: a plain object inherits `toString` and
    // `constructor`, and a dependency named after either is not a thing we want
    // to invent.
    for (const name of Object.keys(block)) names.add(name);
  }

  return names;
}

/**
 * D16: no corepack prefix is passed, because `addDependencyCommand` has no such
 * option — passing one is an excess-property compile error and a runtime no-op.
 * The prefix `addDependency` adds for non-npm/bun/deno managers is nypm's own
 * predicate and is not reproducible from here without shelling out to corepack,
 * so this string is the escape hatch a user can paste, not a claim about the
 * exact argv apply will spawn.
 */
function installCommandFor(
  packageManager: PackageManagerName,
  dependencies: readonly PlannedDependency[],
): string | null {
  if (dependencies.length === 0) return null;

  // `range === ""` renders as a bare name: an unversioned spec is `react`, and
  // `react@` is a 404.
  const render = (d: PlannedDependency): string => (d.range === "" ? d.name : `${d.name}@${d.range}`);

  const prod = dependencies.filter((d) => !d.dev).map(render);
  const dev = dependencies.filter((d) => d.dev).map(render);

  const commands: string[] = [];
  if (prod.length > 0) commands.push(addDependencyCommand(packageManager, prod));
  if (dev.length > 0) commands.push(addDependencyCommand(packageManager, dev, { dev: true }));
  return commands.join(" && ");
}

// ---- theme ------------------------------------------------------------------

/**
 * D5/D7 put the ENTIRE theme merge in `plan()` — `mergeThemeSource` is pure and
 * *throws* on an unmergeable base, and a throw after component files are on disk
 * violates "nothing touches disk until every check has passed".
 *
 * `src/plan/theme-fold.ts` is that merge and is a later phase. Until it lands
 * this refuses loudly rather than dropping contributions: a silently discarded
 * fragment is a theme that is missing entries nobody will connect to an install.
 */
function foldTheme(
  config: LoadedConfig,
  fragments: readonly { itemId: CanonicalId; kind: string; path: string }[],
  diagnostics: Diagnostic[],
): null {
  if (config.themeDestination === null) {
    if (fragments.length > 0) {
      diagnostics.push(
        diag(
          "meta-degraded",
          `${fragments.length} theme contribution(s) were dropped because manteen.json declares no \`theme\`: ${fragments.map((f) => `${f.itemId} (${f.path})`).join(", ")}. Set \`theme\` to the file that exports your createTheme(...) call to fold them in.`,
          { items: [...new Set(fragments.map((f) => f.itemId))] },
        ),
      );
    }
    return null;
  }

  if (fragments.length === 0) {
    // Correct, not a gap: nothing was folded, so nothing is owned. The receipt
    // records `theme: null` for exactly this case even when `config.theme` names
    // a file that exists on disk.
    return null;
  }

  throw new Error(
    `plan: ${fragments.length} item(s) contribute to ${config.themeDestination} and the theme fold ` +
      `(src/plan/theme-fold.ts) has not landed. D7 puts the whole merge in plan() so an unmergeable ` +
      `base refuses before anything is written; refusing here rather than dropping the contributions ` +
      `keeps that property. Contributions: ${fragments.map((f) => `${f.itemId} (${f.kind}: ${f.path})`).join(", ")}.`,
  );
}

// ---- receipt ----------------------------------------------------------------

/**
 * Both consequences of forcing, stated before the user forces.
 *
 * The second one is the easy half to omit and the more surprising one: an
 * unreadable receipt makes `buildIndex` return an empty map, so the cross-run
 * collision check is off for the whole run, not merely for the records that are
 * being discarded.
 */
function receiptUnreadable(state: Extract<ReceiptState, { present: true; ok: false }>): Diagnostic {
  const head =
    state.reason === "future-version"
      ? `${state.path} was written by a newer version of manteen (lockfileVersion ${state.sawVersion ?? "?"}; this build understands ${RECEIPT_VERSION}).`
      : `${state.path} could not be read: ${state.detail}`;

  const forcing =
    state.reason === "future-version"
      ? "Forcing rewrites it at version 1, discarding fields this version does not understand,"
      : "Forcing discards the ownership records of every previously installed item,";

  return diag(
    "receipt-unreadable",
    `${head}\n${forcing} and leaves the cross-run collision check switched off for that run.`,
    { path: state.path },
  );
}
