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
import { extname, resolve as resolvePath } from "node:path";

import { addDependencyCommand, detectPackageManager, type PackageManagerName } from "nypm";
import { satisfies } from "semver";
import { hashFileBytes } from "../apply/preflight";
import { loadEnv } from "../config/load";
import { splitItemId } from "../config/registries";
import type { LoadedConfig } from "../config/types";
import { createSourceWalker } from "../fs/walk";
import { checkCollisions } from "../gates/collision";
import { checkMantineVersion } from "../gates/mantine-version";
import { checkProvider } from "../gates/provider";
import { checkReceipt } from "../gates/receipt";
import { aggregate } from "../gates/report";
import { checkReservedTargets } from "../gates/reserved";
import { installedVersion, resolveMantineInstall } from "../gates/resolve-mantine-install";
import { reportStylesApi } from "../gates/styles-api";
import { indexSourceFor } from "../inventory/available";
import { createReceiptReader, createReceiptValidator } from "../receipt/load";
import { basePathFor, toReceiptPath } from "../receipt/path";
import { buildIndex, ownerOf, readReceipt } from "../receipt/read";
import { diag } from "./diagnostics";
import { createHttpLoader, type IndexResolver, type IndexSource, isHttpUrl } from "./loader-http";
import { createFileLoader, isFileUrl } from "./loader-local";
import { mergeFile } from "./merge-file";
import { resolve as resolveGraph } from "./resolve";
import { foldStyles, needsStylePlan, type StyleBase } from "./styles-fold";
import { foldTheme } from "./theme-fold";
import type {
  CanonicalId,
  Diagnostic,
  Disposition,
  ExistingHashes,
  ItemLoader,
  Plan,
  PlanFn,
  PlanItem,
  PlannedDependency,
  PlannedFile,
  PlanOptions,
  ReceiptState,
  ResolvedFile,
  ResolvedItem,
  ResolvePorts,
} from "./types";
import { RECEIPT_VERSION } from "./types";

/**
 * Never reached while `plan.ok` is false, which is the only state it can be in
 * when this is used: `no-package-manager` is a non-forceable error. `Plan
 * .packageManager` is non-nullable because every path that reads it has already
 * passed that gate, and widening the frozen contract type to carry a state the
 * contract says cannot escape would push the check onto every reader.
 */
const NO_PACKAGE_MANAGER = "npm" as PackageManagerName;

export const plan = planImpl satisfies PlanFn;

async function planImpl(config: LoadedConfig, refs: string[], options: PlanOptions): Promise<Plan> {
  const root = config.root;
  const force = options.force === true;
  const operation = options.operation ?? "add";

  // Mutates `process.env` (see `loadEnv`), and is the ONLY place that reads it.
  // Everything downstream takes the returned map as a parameter — a module that
  // reaches for `process.env` itself is unreachable from a test that sets one.
  const env = loadEnv(root);

  const ports: ResolvePorts = { load: createItemLoader(config, env), target: config.target, env };
  const graph = await resolveGraph(ports, config, refs);

  const diagnostics: Diagnostic[] = [...graph.diagnostics];
  diagnostics.push(...checkCollisions(graph.files, root));
  diagnostics.push(...checkReservedTargets(graph.files, root));
  // §6. Config-level state (`config.jsconfigOnly`), but the refusal is
  // conditioned on what the RESOLVED graph actually ships, so it lives here —
  // needs no hash, no receipt, no gate that reads the network.
  diagnostics.push(...checkJsconfigOnly(graph.files, config.jsconfigOnly, config.tsconfigPath));

  // ---- the Mantine-aware gates (D11, D13, styles-api) -----------------------
  // Push order is not observable: `aggregate` sorts on (severity, code, path,
  // items, message), which totally orders anything two gates can produce. These
  // sit here — high in the function and well above `aggregate` — because that is
  // the one ordering constraint that IS real.

  // ONE read, held in a const rather than called twice. It feeds the version
  // gate AND `Plan.mantine`; two calls could see two different node_modules if a
  // concurrent install lands mid-plan, and the plan would then refuse on a
  // version it does not report.
  const mantine = resolveMantineInstall(root);

  // D11. `graph.dependencies`, deliberately NOT the post-D17 `deps` computed
  // below. The two agree for `@mantine/core` today only because D17 drops a
  // dependency exactly when the installed version satisfies its range — which is
  // the case this gate would pass anyway. That is a coincidence of two
  // independent rules, and the day D17 gains a second reason to filter is the
  // day the version check silently stops running.
  diagnostics.push(
    ...checkMantineVersion({
      items: graph.items,
      dependencies: graph.dependencies,
      install: mantine,
    }),
  );

  // D13 — always warns. The walker is injected here so `gates/provider.ts` stays
  // pure; it is the only filesystem this gate ever sees. `themeFragments` rides
  // along because D5 absorbs a theme item's file OUT of `graph.files`, and the
  // one catalog item that declares `provider` is exactly that item.
  diagnostics.push(
    ...checkProvider({
      root: graph.root,
      items: graph.items,
      files: graph.files,
      themeFragments: graph.themeFragments,
      walk: createSourceWalker(),
    }),
  );

  // `graph.items`, not `graph.files`: `meta.mantine.stylesApi` is declared per
  // item and is display-only (severity info, never a refusal).
  diagnostics.push(...reportStylesApi(graph.items));

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
  const existingBases: Map<string, string | null> = new Map();
  const unreadableBases = new Set<string>();
  for (const file of graph.files) {
    if (existing.has(file.destination)) continue;
    // EISDIR ONLY, and by `code` rather than by message text. `hashFileBytes`
    // throws on everything that is not ENOENT, deliberately (preflight.ts: an
    // EACCES is not absence, and answering `null` for one would let the write
    // phase replace something we were never able to inspect). That stays true:
    // every other code still throws and still reaches `renderThrown`.
    //
    // A directory sitting at a planned destination is different in kind — it is
    // an ordinary user-side file state, not an fs error nobody anticipated, and
    // it is the one state where the raw throw hid BOTH the code every other
    // plan-stage refusal carries and the path that would have said which file.
    try {
      existing.set(file.destination, hashFileBytes(file.destination));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EISDIR") throw error;
      existing.set(file.destination, null);
      diagnostics.push(directoryAtDestination(file.itemId, file.destination, root));
    }
    const baseDestination = basePathFor(file.destination, root);
    if (!existingBases.has(baseDestination)) {
      try {
        existingBases.set(baseDestination, hashFileBytes(baseDestination));
      } catch (error) {
        existingBases.set(baseDestination, null);
        unreadableBases.add(baseDestination);
        // UNCONDITIONAL, and the distinction is worth stating because the two
        // base failures are not the same kind of problem:
        //
        //   - unusable output path (EISDIR, EACCES, ENOTDIR, ELOOP — here)
        //     cannot supply a trustworthy pre-image and be safely replaced
        //     through the journal, so every operation is blocked, including
        //     `add` and `--take-upstream`, which consult no ancestor but still
        //     have to land one. Refusing in plan is what keeps it a coded
        //     refusal; without this the run reaches `writeBases` and dies as a
        //     bare `error apply` after the journal unwinds — legible only to
        //     whoever wrote the journal.
        //   - missing or corrupt (readable, wrong bytes — `planUpdatedFile`) is
        //     an INPUT problem. It blocks only a merging update; `--take-upstream`
        //     overwrites it, which is what makes that flag the repair path.
        diagnostics.push(
          diag(
            "merge-base-unreadable",
            `${toReceiptPath(baseDestination, root)} cannot be read as a merge base: ${(error as Error).message}`,
            { items: [file.itemId], path: baseDestination },
          ),
        );
      }
    }
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

  const items = graph.items.map((item) =>
    toPlanItem(
      item,
      existing,
      existingBases,
      unreadableBases,
      index,
      root,
      operation,
      options,
      diagnostics,
    ),
  );
  const files = items.flatMap((item) => item.files);
  const removedBases = planRemovedBases(receipt, items, operation, root, diagnostics);
  if (operation === "add") diagnostics.push(...checkDestinations(files, options, root));

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

  // ---- theme (D5, D6, D7) ---------------------------------------------------
  // Before `aggregate`, not inline in the object literal below: the fold can
  // refuse, and the aggregator is what decides `ok`. Anything pushed after it is
  // silently dropped.
  //
  // The write-list side of D5 needs no code here: `resolve.ts` absorbs a file
  // whose destination equals `config.themeDestination` into `themeFragments`
  // before it ever reaches `graph.files` (resolve.ts:319), so `items`, `files`
  // and every gate above already see a write list with the theme removed. The
  // e2e asserts it rather than trusting it.
  const folded = foldTheme({
    destination: config.themeDestination,
    base: readThemeBase(config.themeDestination, graph.themeFragments.length),
    fragments: graph.themeFragments,
    root,
  });
  diagnostics.push(...folded.diagnostics);
  const theme = folded.theme;

  // ---- managed package styles (D26-D31) -----------------------------------
  const priorStyles = receipt.present && receipt.ok ? receipt.receipt.styles : null;
  const styleBase = readStylesBase(
    config.stylesDestination,
    needsStylePlan(graph.items, priorStyles),
  );
  const foldedStyles = foldStyles({
    root,
    destination: config.stylesDestination,
    prior: priorStyles,
    items: graph.items,
    base: styleBase,
  });
  diagnostics.push(...foldedStyles.diagnostics);
  const styles = foldedStyles.styles;

  const report = aggregate(diagnostics, force);

  return {
    version: 1,
    operation,
    root,
    configPath: config.configPath,
    items,
    files,
    removedBases,
    dependencies: deps,
    packageManager,
    installCommand: detected === undefined ? null : installCommandFor(detected, deps),
    theme,
    styles,
    mantine,
    receipt,
    diagnostics: report.diagnostics,
    ok: report.ok,
  };
}

function planRemovedBases(
  receipt: ReceiptState,
  items: readonly PlanItem[],
  operation: "add" | "update",
  root: string,
  diagnostics: Diagnostic[],
): Plan["removedBases"] {
  if (operation === "update" || !receipt.present || !receipt.ok) return [];

  const current = new Map(
    items.map((item) => [
      item.id,
      new Set(item.files.map((file) => toReceiptPath(file.destination, root))),
    ]),
  );
  const removed: Plan["removedBases"] = [];
  for (const priorItem of receipt.receipt.items) {
    const destinations = current.get(priorItem.id);
    if (destinations === undefined) continue;
    for (const priorFile of priorItem.files) {
      if (destinations.has(priorFile.destination)) continue;
      const destination = basePathFor(resolvePath(root, ...priorFile.destination.split("/")), root);
      try {
        const sha256 = hashFileBytes(destination);
        removed.push({ destination, existing: sha256 === null ? null : { sha256 } });
      } catch (error) {
        diagnostics.push(
          diag(
            "merge-base-unreadable",
            `${toReceiptPath(destination, root)} cannot be removed as obsolete Manteen state: ${(error as Error).message}`,
            { items: [priorItem.id], path: destination },
          ),
        );
      }
    }
  }
  return removed;
}

function readStylesBase(destination: string | null, needed: boolean): StyleBase | null {
  if (destination === null || !needed) return null;
  let bytes: Buffer;
  try {
    bytes = readFileSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return {
    text: bytes.toString("utf8"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

// ---- ports ------------------------------------------------------------------

/**
 * Dispatch on scheme rather than trying one loader and falling back.
 *
 * Node's `fetch` rejects `file:` outright ("not implemented… yet…"), so the two
 * schemes genuinely need different code — a `file:` registry has no path through
 * the HTTP loader at all, and an `http:` URL handed to the file loader produces
 * an ENOENT naming a path the user never wrote.
 *
 * The third branch is not a formality. Falling through to either loader for an
 * unrecognised scheme is how `s3://bucket/{name}.json` becomes "no such file or
 * directory" — a message about the wrong problem entirely. It says which scheme
 * was seen and which three exist.
 *
 * EXPORTED for `commands/info.ts`, which fetches one item document without
 * planning a graph. It had re-expressed this function, its index resolver and
 * its `unsupportedScheme` because all three were private here — three copies of
 * "how does manteen fetch an item", which is exactly how `info` and `add` come
 * to disagree about what a `s3:` URL or a 404 means.
 */
export function createItemLoader(
  config: LoadedConfig,
  env: Record<string, string | undefined>,
): ItemLoader {
  const file = createFileLoader();
  const http = createHttpLoader({ index: indexResolverFor(config, env) });

  return async (request) => {
    if (isFileUrl(request.url)) return file(request);
    if (isHttpUrl(request.url)) return http(request);
    return {
      ok: false,
      reason: "network",
      redactedUrl: request.redactedUrl,
      // A clause, not a sentence: `resolve.ts` strips the trailing punctuation
      // off a loader's detail and appends its own.
      detail: unsupportedScheme(request.redactedUrl),
    };
  };
}

/**
 * The scheme, taken from the REDACTED url.
 *
 * `request.url` is the expanded one and is the single string in this file that
 * may hold a secret. A `${VAR}` at the very start of a template would make the
 * two disagree — and in that case the redacted form prints the literal
 * `${VAR}`, which is exactly what the user needs to see and carries nothing.
 */
function unsupportedScheme(redactedUrl: string): string {
  const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.exec(redactedUrl)?.[0];
  return scheme === undefined
    ? "the registry URL has no scheme — manteen fetches file:, http: and https:"
    : `${scheme} is not a scheme manteen fetches — use file:, http: or https:`;
}

/**
 * D21's per-registry `index`, resolved for whichever registry produced a
 * request, with `${VAR}` expanded.
 *
 * DELEGATES to the ONE implementation, `inventory/available.ts`'s
 * `indexSourceFor` — "what is this registry's index request": the URL, the
 * headers, the `params` a registry that authenticates by query parameter needs
 * on its index too, and the rule that a request with an unexpanded `${VAR}` in
 * it never goes out. This function used to carry its own copy of all four; two
 * implementations of "which index is this" is how the listing and the
 * did-you-mean come to disagree about which registry was even asked.
 *
 * `IndexRequest` is structurally a superset of `IndexSource` (`url` +
 * `headers`), so it satisfies the loader contract unchanged.
 *
 * The loader is handed `ItemRequest`s and has no idea which registry produced
 * one; the config does. Expansion stays out of the loader for the same reason
 * as before — a module that cannot see the environment cannot leak it.
 */
function indexResolverFor(
  config: LoadedConfig,
  env: Record<string, string | undefined>,
): IndexResolver {
  return (request): IndexSource | null => {
    const { namespace } = splitItemId(request.id);
    // A `url:` ref names no registry, so no index can be configured for it.
    if (namespace === null) return null;

    const registry = config.registries.get(namespace);
    if (registry === undefined) return null;

    // `no-index` and `missing-env` both degrade to silence here: a
    // did-you-mean is a nicety, and a request with a hole in it published to a
    // registry access log is not.
    const source = indexSourceFor(registry, env);
    return source.ok ? source.request : null;
  };
}

// ---- resolved -> planned ----------------------------------------------------

function toPlanItem(
  item: ResolvedItem,
  existing: ExistingHashes,
  existingBases: ExistingHashes,
  unreadableBases: ReadonlySet<string>,
  index: ReturnType<typeof buildIndex>,
  root: string,
  operation: "add" | "update",
  options: PlanOptions,
  diagnostics: Diagnostic[],
): PlanItem {
  const files: PlannedFile[] = item.files.map((file) => {
    // Of the UTF-8 encoding of the STRING we would write. `existing` hashes RAW
    // BYTES. The two compare equal only because write-files.ts writes with an
    // explicit "utf8" encoding, no BOM and no newline translation.
    const sha256 = createHash("sha256").update(file.content, "utf8").digest("hex");
    const onDisk = existing.get(file.destination) ?? null;
    const baseDestination = basePathFor(file.destination, root);
    const baseOnDisk = existingBases.get(baseDestination) ?? null;
    const upstream = { content: file.content, sha256 };
    const common = {
      ...file,
      upstream,
      base: {
        destination: baseDestination,
        content: file.content,
        sha256,
        existing: baseOnDisk === null ? null : { sha256: baseOnDisk },
      },
      existing: onDisk === null ? null : { sha256: onDisk },
    };

    const priorOwner = ownerOf(index, file.destination);
    if (operation === "add") {
      return {
        ...common,
        sha256,
        disposition: dispositionFor(sha256, onDisk),
        priorOwner,
      };
    }

    return planUpdatedFile({
      common,
      priorOwner,
      onDisk,
      baseOnDisk,
      baseReadFailed: unreadableBases.has(baseDestination),
      root,
      takeUpstream: options.takeUpstream === true,
      diagnostics,
    });
  });

  return { ...item, files };
}

type CommonPlannedFile = Omit<PlannedFile, "sha256" | "disposition" | "priorOwner">;

function planUpdatedFile(input: {
  common: CommonPlannedFile;
  priorOwner: PlannedFile["priorOwner"];
  onDisk: string | null;
  baseOnDisk: string | null;
  baseReadFailed: boolean;
  root: string;
  takeUpstream: boolean;
  diagnostics: Diagnostic[];
}): PlannedFile {
  const { common, priorOwner, onDisk, root, diagnostics } = input;
  const where = toReceiptPath(common.destination, root);

  // A current item may start shipping a new file. Absence is the only implicit
  // permission to create it; an occupied unowned target is not an ancestor.
  if (priorOwner === null) {
    if (onDisk !== null) {
      diagnostics.push(
        diag(
          "update-conflict",
          `${where} is newly shipped upstream but an unowned file already occupies that destination. ` +
            "Move it or resolve the collision explicitly; update will not replace it.",
          { items: [common.itemId], path: common.destination },
        ),
      );
    }
    return {
      ...common,
      sha256: common.upstream.sha256,
      disposition: dispositionFor(common.upstream.sha256, onDisk),
      priorOwner,
    };
  }

  const expectedBase = priorOwner.baseSha256;

  // `--take-upstream` is a request for incoming bytes, not a merge. It reads no
  // ancestor, so an absent or corrupt one cannot make it fail — and refusing
  // here would strand the one flag that can repair a lost sidecar. The base is
  // still rewritten by apply's phase 6 from the bytes we are about to install.
  const merging = !input.takeUpstream;

  if (merging && input.baseReadFailed) {
    return {
      ...common,
      sha256: common.upstream.sha256,
      disposition: dispositionFor(common.upstream.sha256, onDisk),
      priorOwner,
    };
  }
  if (merging && input.baseOnDisk !== expectedBase) {
    const observed = input.baseOnDisk === null ? "missing" : `hash ${input.baseOnDisk}`;
    diagnostics.push(
      diag(
        "merge-base-unreadable",
        `${where} cannot be updated because its pristine base is ${observed}; ` +
          `manteen.lock.json records ${expectedBase}. Restore ${toReceiptPath(common.base.destination, root)} from version control and re-run.`,
        { items: [common.itemId], path: common.base.destination },
      ),
    );
    return {
      ...common,
      sha256: common.upstream.sha256,
      disposition: dispositionFor(common.upstream.sha256, onDisk),
      priorOwner,
    };
  }

  // Read only on the merging path. `baseText !== null` below is therefore the
  // same condition as `merging`, in a form the compiler can narrow.
  let baseText: string | null = null;
  if (merging) {
    const base = readExactUtf8(common.base.destination, expectedBase);
    if (!base.ok) {
      diagnostics.push(
        diag("merge-base-unreadable", `${where} cannot be updated: ${base.detail}`, {
          items: [common.itemId],
          path: common.base.destination,
        }),
      );
      return {
        ...common,
        sha256: common.upstream.sha256,
        disposition: dispositionFor(common.upstream.sha256, onDisk),
        priorOwner,
      };
    }
    baseText = base.text;
  }

  if (onDisk === null && !input.takeUpstream) {
    diagnostics.push(
      diag(
        "update-conflict",
        `${where} is tracked but missing locally. Update treats deletion as intentional; pass --take-upstream to restore it.`,
        { items: [common.itemId], path: common.destination },
      ),
    );
    return {
      ...common,
      sha256: common.upstream.sha256,
      disposition: "create",
      priorOwner,
    };
  }

  let content = common.upstream.content;
  if (baseText !== null && onDisk !== null) {
    const local = readExactUtf8(common.destination, onDisk);
    if (!local.ok) {
      diagnostics.push(
        diag("update-conflict", `${where} cannot be merged: ${local.detail}`, {
          items: [common.itemId],
          path: common.destination,
        }),
      );
    } else if (onDisk === expectedBase) {
      content = common.upstream.content;
    } else if (common.upstream.sha256 === expectedBase) {
      content = local.text;
    } else if (onDisk === common.upstream.sha256) {
      content = local.text;
    } else {
      const merged = mergeFile(local.text, baseText, common.upstream.content);
      if (merged.ok) content = merged.content;
      else {
        const regions = merged.conflicts
          .slice(0, 3)
          .map(
            (conflict) =>
              `local line ${conflict.localStart + 1}, base line ${conflict.baseStart + 1}, upstream line ${conflict.incomingStart + 1}`,
          )
          .join("; ");
        diagnostics.push(
          diag(
            "update-conflict",
            `${where} has ${merged.conflicts.length} overlapping local/upstream change${merged.conflicts.length === 1 ? "" : "s"} (${regions}). ` +
              "Nothing will be written. Resolve the edits manually or pass --take-upstream to discard local adaptations for currently shipped files.",
            { items: [common.itemId], path: common.destination },
          ),
        );
        // Conflict bytes are never written. Keep the local projection so
        // reporters cannot mistake a marker-filled synthetic result for output.
        content = local.text;
      }
    }
  }

  const finalSha256 = createHash("sha256").update(content, "utf8").digest("hex");
  return {
    ...common,
    content,
    sha256: finalSha256,
    disposition: dispositionFor(finalSha256, onDisk),
    priorOwner,
  };
}

type ExactText = { ok: true; text: string } | { ok: false; detail: string };

function readExactUtf8(path: string, expectedSha256: string): ExactText {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    return { ok: false, detail: `${path} could not be read: ${(error as Error).message}` };
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) {
    return { ok: false, detail: `${path} changed while the update plan was being computed` };
  }
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    return { ok: false, detail: `${path} is not valid UTF-8 and cannot be line-merged exactly` };
  }
  return { ok: true, text };
}

function dispositionFor(planned: string, onDisk: string | null): Disposition {
  if (onDisk === null) return "create";
  return onDisk === planned ? "identical" : "overwrite";
}

// ---- jsconfig-only (§6) ------------------------------------------------------

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * §6's refusal, at last given a body.
 *
 * `config.jsconfigOnly` is a property of the PROJECT, proven once at load (see
 * `LoadedConfig.jsconfigOnly`) — but the refusal is conditioned on the REF
 * actually shipping TypeScript, which is only known once the graph is
 * resolved. Hence this runs here, not in `config/load.ts`.
 *
 * Checked against `sourcePath`, never `destination`: an item with an explicit
 * `target` writes wherever `target` says, verbatim, regardless of extension —
 * `aliases.ts`'s alias branch is the only one that re-appends the SOURCE
 * extension onto a destination, so a `target`-placed file's destination can
 * lack `.tsx` even though the wire document unmistakably ships it. `sourcePath`
 * is the fact the policy is actually about: what the item ships, not where it
 * lands. Only `.ts`/`.tsx` match, per §6's letter — not `.mts`/`.cts`, which it
 * does not name.
 *
 * EXPORTED so a test can drive it directly, the way the other `gates/*` checks
 * do: the `Diagnostic` it returns is the one `plan()` actually reports, so a
 * test against it is a test against production behaviour, not a paraphrase.
 *
 * `tsconfigPath` is `config.tsconfigPath` — the file that actually backed
 * `paths` — not a claim that no `tsconfig.json` exists anywhere. Those are
 * different facts: a project can have BOTH a real `tsconfig.json` and a
 * `jsconfig.json`, with `manteen.json`'s `tsconfig` field pointed at the
 * latter (the bypass §6 closes). In that project a real tsconfig is sitting
 * right there, and a message that said "no tsconfig.json" would be false, and
 * "add one" would be the wrong next step for someone who already has one. What
 * is true in every case `jsconfigOnly` can be true is narrower and is what the
 * message says instead: THIS is the file backing your aliases, and it is a
 * jsconfig.
 */
export function checkJsconfigOnly(
  files: readonly ResolvedFile[],
  jsconfigOnly: boolean,
  tsconfigPath: string,
): Diagnostic[] {
  if (!jsconfigOnly) return [];

  const offending = files.filter((file) => TYPESCRIPT_EXTENSIONS.has(extname(file.sourcePath)));
  if (offending.length === 0) return [];

  const items = [...new Set(offending.map((file) => file.itemId))].sort();
  const paths = [...new Set(offending.map((file) => file.sourcePath))].sort();

  const message = [
    `${items.join(", ")} ship${items.length === 1 ? "s" : ""} TypeScript (${paths.join(", ")}), ` +
      `but the config backing your aliases here is ${tsconfigPath}, a jsconfig.json.`,
    "manteen writes registry files verbatim and never transpiles, so a `.ts`/`.tsx` file has no",
    "real tsconfig to resolve its syntax against.",
    "",
    "Point `tsconfig` in manteen.json at a real tsconfig.json declaring the same `paths` (adding",
    "one first if you don't have one) and re-run, or choose an item that ships JavaScript instead.",
    "",
    "Pointing `tsconfig` at a jsconfig.json — this one or any other — will not work: jsconfig.json",
    "marks a JavaScript project and does not change what manteen writes.",
  ].join("\n");

  return [diag("jsconfig-typescript-unsupported", message, { items })];
}

// ---- destination-exists -----------------------------------------------------

/**
 * A planned destination that is a DIRECTORY.
 *
 * `destination-exists` because that is exactly what happened — something is
 * already at the path — and because `plan/types.ts` is frozen, so there is no
 * code of its own to mint. It is emitted from the hash pass rather than from
 * `checkDestinations` below for two reasons that both matter: the disposition
 * this file would get is `create` (nothing hashed), so the loop below skips it;
 * and `checkDestinations` returns early under `--overwrite`, which for a
 * directory would turn a clear refusal into an EACCES/EISDIR at write time.
 * Emitted here, it refuses under every flag combination — `destination-exists`
 * is `forceable: false`, so `--force` does not downgrade it either.
 *
 * The message deliberately does NOT end in `checkDestinations`' "Pass
 * --overwrite to replace it or --no-overwrite to keep it": neither flag can help
 * here, and advice that cannot work is worse than none.
 */
function directoryAtDestination(
  itemId: CanonicalId,
  destination: string,
  root: string,
): Diagnostic {
  return diag(
    "destination-exists",
    `${toReceiptPath(destination, root)} is a directory, not a file. manteen writes files and ` +
      `will not replace a directory, so neither --overwrite nor --force applies. Move or remove ` +
      `it and re-run.`,
    { items: [itemId], path: destination },
  );
}

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
  const drifted = file.existing !== null && file.existing.sha256 !== owner.installedSha256;
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
  const render = (d: PlannedDependency): string =>
    d.range === "" ? d.name : `${d.name}@${d.range}`;

  const prod = dependencies.filter((d) => !d.dev).map(render);
  const dev = dependencies.filter((d) => d.dev).map(render);

  const commands: string[] = [];
  if (prod.length > 0) commands.push(addDependencyCommand(packageManager, prod));
  if (dev.length > 0) commands.push(addDependencyCommand(packageManager, dev, { dev: true }));
  return commands.join(" && ");
}

// ---- theme ------------------------------------------------------------------

/**
 * The base theme on disk, decoded AND hashed from ONE read.
 *
 * The natural spelling — `hashFileBytes(dest)` then `readFileSync(dest, "utf8")`
 * — is a TOCTOU hole with teeth. `PlannedTheme.base.sha256` is what apply's
 * preflight compares the file against to prove the project did not change
 * between plan and apply; if it describes bytes other than the ones that were
 * folded, that check either false-fails or, worse, passes against the wrong
 * content and apply overwrites an edit it never saw.
 *
 * The two fields also live in different hash domains on purpose, matching
 * `PlannedFile`: `sha256` is of the RAW BYTES (the domain `hashFileBytes`,
 * `ExistingHashes` and `preflight` all use), while `text` is the UTF-8 decoding
 * that the merge reads. Hashing the decoded string instead would agree on every
 * ASCII fixture and diverge only on a file with a BOM — i.e. it would ship green.
 *
 * `fragmentCount` gates the read rather than the caller doing it, so the
 * "declared a theme, nothing contributed" case costs no syscall and cannot throw
 * EACCES on a file this run has no business opening. The theme destination is
 * deliberately absent from the `ExistingHashes` pass above: that map is keyed by
 * planned-file destinations, and D5 guarantees the theme is not one of them.
 */
function readThemeBase(
  destination: string | null,
  fragmentCount: number,
): { text: string; sha256: string } | null {
  if (destination === null || fragmentCount === 0) return null;

  let bytes: Buffer;
  try {
    bytes = readFileSync(destination);
  } catch (error) {
    // ENOENT is the ordinary "no theme yet" case and D6's trigger for adopting
    // the first contribution as the base. EACCES / EISDIR are NOT absence, and
    // returning null for them would make the fold write a file it could never
    // have read — exactly the clobber D5 exists to prevent.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  return {
    text: bytes.toString("utf8"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
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
  const newer = state.reason === "future-version";
  const head = newer
    ? `${state.path} was written by a newer version of manteen (lockfileVersion ${state.sawVersion ?? "?"}; this build understands ${RECEIPT_VERSION}).`
    : `${state.path} could not be read: ${state.detail}`;

  const forcing = newer
    ? `Forcing rewrites it at version ${RECEIPT_VERSION}, discarding fields this version does not understand,`
    : "Forcing discards the ownership records of every previously installed item,";

  return diag(
    "receipt-unreadable",
    `${head}\n${forcing} and leaves the cross-run collision check switched off for that run.`,
    { path: state.path },
  );
}
