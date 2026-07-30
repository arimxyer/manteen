/**
 * The resolver: refs in, `ResolvedGraph` out.
 *
 * PURE by the §1 convention — no `node:fs`, no `fetch`, no `process.env`. Every
 * byte it sees arrives through `ResolvePorts`, so the whole transitive walk runs
 * against an in-memory loader with zero sockets opened, which is what makes the
 * fifty-run byte-identity assertion cheap enough to actually run.
 *
 * `validate-item.ts` is the one indirection: its validators read the kit's
 * bundled schemas when the factory is called. The no-fs lint rule bans the
 * *import* here, and a caller that wants a fully in-memory resolve can pass its
 * own `ItemValidator` as the optional fourth argument.
 *
 * ── Determinism ────────────────────────────────────────────────────────────
 * Nothing here may depend on the order responses arrive in. Every wave is sorted
 * by canonical id before dispatch, results are consumed in that same order, and
 * every order-bearing field is sorted before it lands on the graph:
 * `requestedBy`, `dependencies` and each `wantedBy` (`deps.ts`), the cycle
 * lists, the item order (`topoSort`'s lexicographic tiebreak) and finally the
 * diagnostics. Sorting the wave is also what makes the 200-item ceiling
 * deterministic — when the cap bites mid-wave, *which* items made the cut must
 * not depend on which response finished first.
 *
 * ── What this module deliberately does NOT do ──────────────────────────────
 * It never groups, dedupes or merges files by DESTINATION. Two `ResolvedFile`s
 * with the same destination and different `itemId` both survive into
 * `ResolvedGraph.files` on purpose: destination-dedupe is the shipped bug D8
 * exists to fix, and `gates/collision.ts` needs both entries to see the
 * collision at all. Identity dedupe keys on canonical id, and on nothing else.
 * `target-collision` is emitted by that gate, never here — phase 2's done-when
 * says "exactly one", so emitting it in both places fails the assertion it was
 * written for.
 *
 * It also does not emit `name-mismatch`, `file-no-content` or the item-level
 * `registry:font` refusal: `validate-item.ts` owns all three, because all three
 * are statements about the document rather than about the graph.
 */

import type { LoadedConfig } from "../config/types";
import { resolutionApplied } from "../gates/collision";
import { type DependencyClaim, unionDependencies } from "./deps";
import { diag, sortDiagnostics } from "./diagnostics";
import { findCycles, topoSort } from "./graph";
import { bareNameOfRef, parseDependencyRef, parseRef, type ResolvableRef } from "./ref";
import { ambiguousBareRef, type NormalizedRegistry, toRequest } from "./registry-source";
import type {
  CanonicalId,
  Diagnostic,
  ItemRequest,
  LoadedDoc,
  ResolvedFile,
  ResolvedGraph,
  ResolvedItem,
  ResolvePorts,
  ThemeFragment,
} from "./types";
import { createItemValidator, type ItemValidator } from "./validate-item";

/**
 * D25's ceilings, declared once.
 *
 * `responseBytes` is enforced by the loaders, not here — an over-size response
 * arrives as `LoadedDoc.reason === "too-large"` and this module only maps it to
 * a diagnostic. It lives here anyway so the two loaders and the resolver cannot
 * disagree about what the limit is.
 */
export const LIMITS = {
  depth: 20,
  nodes: 200,
  responseBytes: 8 * 1024 * 1024,
  concurrency: 6,
} as const;

/** UTF-16 code units. Never `localeCompare` — a plan must not depend on `LANG`. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compiled once per process rather than once per `resolve()`.
 *
 * `createItemValidator()` reads two schemas and compiles two ajv validators;
 * doing that per call would put a file read in the hot path of a function whose
 * whole design goal is to have none.
 */
let sharedValidator: ItemValidator | null = null;

/**
 * Bounded-concurrency map that preserves input order in its output.
 *
 * Order preservation is the point: the caller pairs `wave[i]` with `results[i]`,
 * so nothing downstream can observe which request won the race.
 */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      out[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

interface WalkNode {
  id: CanonicalId;
  /** Kept so the validator can be told the name the reference asked for. */
  ref: ResolvableRef;
  request: ItemRequest;
  depth: number;
  requestedBy: Set<CanonicalId | "<root>">;
}

/** One applied resolution, accumulated so D9's warning is emitted once. */
interface AppliedResolution {
  name: string;
  winner: CanonicalId;
  /** Items whose reference was rewritten. `<root>` is excluded — a loser named
   *  on the command line redirected no author's import. */
  redirected: Set<CanonicalId>;
}

export async function resolve(
  ports: ResolvePorts,
  config: LoadedConfig,
  refs: readonly string[],
  validator?: ItemValidator,
): Promise<ResolvedGraph> {
  // biome-ignore lint/suspicious/noAssignInExpressions: lazy memoisation, so the two schema reads happen once per process rather than once per resolve().
  const validate = validator ?? (sharedValidator ??= createItemValidator());
  const registries = normalizeRegistries(config);

  const diagnostics: Diagnostic[] = [];
  const nodes = new Map<CanonicalId, WalkNode>();
  const items = new Map<CanonicalId, ResolvedItem>();
  const dependsOn = new Map<CanonicalId, CanonicalId[]>();
  const itemFragments = new Map<CanonicalId, ThemeFragment[]>();
  const claims: DependencyClaim[] = [];

  // Grouped, so a large or hostile registry cannot produce one diagnostic per
  // edge. Each of these becomes exactly one entry, emitted at the end.
  const applied = new Map<CanonicalId, AppliedResolution>();
  const bareAssumed: string[] = [];
  const bareUnresolvable: { parent: CanonicalId; text: string }[] = [];
  // The dropped items themselves, not just a flag. A ceiling that refuses the
  // run without naming anything leaves the user with no next move.
  const overDepth = new Set<CanonicalId>();
  const overNodeLimit = new Set<CanonicalId>();

  let frontier: WalkNode[] = [];

  /**
   * Apply `resolutions` (D9) to a resolvable reference.
   *
   * Applied to the *reference*, not to the ref string, so every form reaches the
   * same rule — and applied to root refs and transitive ones alike, because the
   * receipt gate's cross-run check assumes the resolver has already rewritten
   * losers. Two mechanisms disagreeing about which item exists is worse than an
   * aggressive rewrite that a warning names.
   *
   * `bareNameOfRef` returns null for a `url:` reference, which a name-keyed
   * resolution can never address. Applied at most once: a resolution whose
   * winner is itself a resolution key does not chain, because a chain has no
   * fixed point a user could predict from reading their config.
   */
  const resolveRef = (
    ref: ResolvableRef,
    by: CanonicalId | "<root>",
  ): ResolvableRef | { invalid: Diagnostic } => {
    const name = bareNameOfRef(ref);
    if (name === null) return ref;

    const winner = config.resolutions.get(name);
    if (winner === undefined || winner === ref.id) return ref;

    const parsed = parseRef(winner);
    if (parsed.kind !== "namespaced" && parsed.kind !== "url") {
      return {
        invalid: diag(
          "unknown-namespace",
          `resolutions[${JSON.stringify(name)}] is ${JSON.stringify(winner)}, which is not a fully-qualified item reference.`,
          { path: config.configPath },
        ),
      };
    }

    const entry = applied.get(ref.id);
    if (entry) {
      if (by !== "<root>") entry.redirected.add(by);
    } else {
      applied.set(ref.id, {
        name,
        winner: parsed.id,
        redirected: new Set(by === "<root>" ? [] : [by]),
      });
    }
    return parsed;
  };

  const admit = (
    ref: ResolvableRef,
    depth: number,
    requestedBy: CanonicalId | "<root>",
  ): CanonicalId | null => {
    const existing = nodes.get(ref.id);
    if (existing) {
      existing.requestedBy.add(requestedBy);
      return existing.id;
    }

    // Built before the ceiling check so a `missing-env` refusal is reported even
    // for an item the walk would have dropped anyway — the user has to set the
    // variable either way.
    const built = toRequest(ref, registries, ports.env);
    if (!built.ok) {
      diagnostics.push(built.diagnostic);
      return null;
    }
    if (nodes.size >= LIMITS.nodes) {
      overNodeLimit.add(ref.id);
      return null;
    }

    nodes.set(ref.id, {
      id: ref.id,
      ref,
      request: built.request,
      depth,
      requestedBy: new Set([requestedBy]),
    });
    frontier.push(nodes.get(ref.id) as WalkNode);
    return ref.id;
  };

  for (const input of refs) {
    const parsed = parseRef(input);
    if (parsed.kind === "bare") {
      // A bare ROOT ref is ambiguous and refused: `defaultRegistry` is deferred,
      // and prompting would make one command mean different things on different
      // machines. A bare `registryDependencies` entry is the opposite case — it
      // has a parent to borrow a namespace from. See the walk below.
      diagnostics.push(ambiguousBareRef(parsed.name, registries));
      continue;
    }
    if (parsed.kind === "invalid") {
      diagnostics.push(
        diag("unknown-namespace", `"${parsed.input}" cannot be resolved because ${parsed.reason}.`),
      );
      continue;
    }

    const resolved = resolveRef(parsed, "<root>");
    if ("invalid" in resolved) {
      diagnostics.push(resolved.invalid);
      continue;
    }
    admit(resolved, 0, "<root>");
  }

  while (frontier.length > 0) {
    const wave = frontier.sort((a, b) => byCodeUnit(a.id, b.id));
    frontier = [];

    const loaded = await mapPool(wave, LIMITS.concurrency, (node) => ports.load(node.request));

    for (let index = 0; index < wave.length; index += 1) {
      const node = wave[index];
      const doc = loaded[index];
      if (node === undefined || doc === undefined) continue;

      if (!doc.ok) {
        diagnostics.push(loadFailure(node, doc));
        continue;
      }

      const validation = validate(doc.doc, {
        id: node.id,
        expectedName: node.ref.kind === "namespaced" ? node.ref.name : null,
        redactedUrl: node.request.redactedUrl,
      });
      diagnostics.push(...validation.diagnostics);
      if (!validation.ok) continue;

      const view = validation.item;
      const namespace = node.ref.kind === "namespaced" ? node.ref.namespace : null;
      const name = node.ref.kind === "namespaced" ? node.ref.name : view.name;

      for (const spec of view.dependencies) claims.push({ itemId: node.id, spec, dev: false });
      for (const spec of view.devDependencies) claims.push({ itemId: node.id, spec, dev: true });

      const files: ResolvedFile[] = [];
      const fragments: ThemeFragment[] = [];

      for (const file of view.files) {
        const target = ports.target(
          { path: file.path, type: file.type, ...(file.target ? { target: file.target } : {}) },
          { id: node.id, namespace },
        );
        if ("refused" in target) {
          diagnostics.push(
            diag(target.refused, target.detail, { items: [node.id], path: file.path }),
          );
          continue;
        }

        // D5: a file landing exactly on the resolved `config.theme` is absorbed
        // into the fold instead of written. Writing it would overwrite the
        // user's theme wholesale — `manteen add theme data-table` silently
        // losing `primaryColor` and four component entries is the failure this
        // prevents — and folding is what lets `@house/theme` and `@base/theme`
        // merge rather than collide.
        if (config.themeDestination !== null && target.destination === config.themeDestination) {
          fragments.push({
            itemId: node.id,
            kind: "absorbed-file",
            path: file.path,
            content: file.content,
          });
          continue;
        }

        files.push({
          itemId: node.id,
          sourcePath: file.path,
          wireType: file.type,
          destination: target.destination,
          content: file.content,
        });
      }

      // Intra-item order: the absorbed file first, then `meta.mantine
      // .themeFragment`. An absorbed file is a whole `createTheme({...})`
      // module and a fragment is an addition to one, so when no base exists on
      // disk D6's "the first source becomes the base" picks the better base.
      if (view.meta.themeFragment) {
        fragments.push({
          itemId: node.id,
          kind: "meta-fragment",
          path: view.meta.themeFragment.path,
          content: view.meta.themeFragment.content,
        });
      }
      if (fragments.length > 0) itemFragments.set(node.id, fragments);

      const children: CanonicalId[] = [];
      for (const spec of view.registryDependencies) {
        const dependency = parseDependencyRef(spec, namespace);
        if (!dependency.ok) {
          if (dependency.bare) {
            bareUnresolvable.push({
              parent: node.id,
              text: `${dependency.name} (from ${node.id})`,
            });
          } else {
            diagnostics.push(
              diag(
                "wire-invalid",
                `${node.id} depends on "${dependency.input}", which cannot be resolved because ${dependency.reason}.`,
                { items: [node.id], path: node.request.redactedUrl },
              ),
            );
          }
          continue;
        }

        if (dependency.assumedLocal) {
          // §5a resolution 5. The kit qualifies bare `uses` at build time
          // (build-registry.ts:138-140), so this is reachable only from a
          // hand-written registry — where shadcn semantics would mean the public
          // Tailwind-shaped registry. Assuming parent-local and saying so beats
          // installing a Tailwind component into a Mantine app.
          bareAssumed.push(`${spec} -> ${dependency.ref.id} (from ${node.id})`);
        }

        const resolved = resolveRef(dependency.ref, node.id);
        if ("invalid" in resolved) {
          diagnostics.push(resolved.invalid);
          continue;
        }

        // Recorded as an edge even when the ceiling refuses to admit it: the
        // graph should describe what the registry declared, and dropping the
        // edge would silently reorder the items that DID make the cut.
        children.push(resolved.id);

        if (node.depth + 1 > LIMITS.depth) {
          overDepth.add(resolved.id);
          continue;
        }
        admit(resolved, node.depth + 1, node.id);
      }

      dependsOn.set(node.id, [...new Set(children)]);
      items.set(node.id, {
        id: node.id,
        namespace,
        name,
        wireType: view.wireType,
        sourceUrl: node.request.redactedUrl,
        // Filled in during the ordering pass below, not here: a later wave can
        // still add a requester, and `dependsOn` is filtered against the items
        // that actually resolved — neither is knowable until the walk ends.
        requestedBy: [],
        dependsOn: [],
        ...(view.meta.requires === undefined ? {} : { requires: view.meta.requires }),
        ...(view.meta.provider === undefined ? {} : { provider: view.meta.provider }),
        cssImports: view.cssImports,
        ...(view.meta.stylesApi === undefined ? {} : { stylesApi: view.meta.stylesApi }),
        files,
      });
    }
  }

  const ids = [...items.keys()];

  for (const cycle of findCycles(ids, dependsOn)) {
    diagnostics.push(
      diag(
        "dependency-cycle",
        `${[...cycle, cycle[0]].join(" -> ")} form a dependency cycle. manteen copies files rather than evaluating them, so the install is still correct; the items are emitted in id order.`,
        { items: cycle },
      ),
    );
  }

  const ordered: ResolvedItem[] = [];
  const files: ResolvedFile[] = [];
  const themeFragments: ThemeFragment[] = [];

  for (const id of topoSort(ids, dependsOn)) {
    const item = items.get(id);
    const node = nodes.get(id);
    if (item === undefined || node === undefined) continue;

    // `dependsOn` is filtered to items that actually resolved, so a reporter
    // never prints an edge to an id that appears nowhere in `items`.
    item.requestedBy = [...node.requestedBy].sort(byCodeUnit);
    item.dependsOn = (dependsOn.get(id) ?? []).filter((dep) => items.has(dep));

    ordered.push(item);
    files.push(...item.files);
    themeFragments.push(...(itemFragments.get(id) ?? []));
  }

  const union = unionDependencies(claims);
  diagnostics.push(...union.diagnostics);

  for (const [loser, entry] of [...applied.entries()].sort((a, b) => byCodeUnit(a[0], b[0]))) {
    diagnostics.push(
      resolutionApplied({
        name: entry.name,
        winner: entry.winner,
        loser,
        redirected: [...entry.redirected].sort(byCodeUnit),
      }),
    );
  }

  if (bareAssumed.length > 0) {
    diagnostics.push(
      diag(
        "bare-dep-assumed-local",
        `Unqualified registryDependencies were resolved against the declaring item's own registry, never against ui.shadcn.com: ${bareAssumed.sort(byCodeUnit).join(", ")}.`,
      ),
    );
  }

  if (bareUnresolvable.length > 0) {
    diagnostics.push(
      diag(
        "bare-dep-unresolvable",
        `Unqualified registryDependencies declared by items that have no namespace to resolve them against: ${bareUnresolvable
          .map((entry) => entry.text)
          .sort(byCodeUnit)
          .join(", ")}. A url: reference carries no registry, so these have to name one.`,
        { items: [...new Set(bareUnresolvable.map((entry) => entry.parent))].sort(byCodeUnit) },
      ),
    );
  }

  // Named, but only for the items that are still missing at the end: an item
  // first reached past a ceiling and later reached again by a shallower path did
  // resolve, and listing it would send the user looking for a problem they do
  // not have.
  const dropped = (over: ReadonlySet<CanonicalId>): CanonicalId[] =>
    [...over].filter((id) => !items.has(id)).sort(byCodeUnit);

  const tooDeep = dropped(overDepth);
  if (tooDeep.length > 0) {
    diagnostics.push(
      diag(
        "depth-exceeded",
        `The dependency walk went deeper than ${LIMITS.depth} levels and stopped. Not resolved: ${tooDeep.join(", ")}.`,
        { items: tooDeep },
      ),
    );
  }

  const overflowed = dropped(overNodeLimit);
  if (overflowed.length > 0) {
    diagnostics.push(
      diag(
        "node-limit",
        `The dependency walk reached the ${LIMITS.nodes}-item ceiling and stopped. Not resolved: ${overflowed.join(", ")}.`,
        { items: overflowed },
      ),
    );
  }

  return {
    root: config.root,
    configPath: config.configPath,
    items: ordered,
    files,
    dependencies: union.dependencies,
    themeFragments,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

/**
 * Interop shim: `LoadedConfig.registries` holds `Registry` (`index: string |
 * null`), `toRequest` takes `NormalizedRegistry` (`index?: string`).
 *
 * `null` is not assignable to `string | undefined`, so the two do not join
 * directly. Delete this the moment one side adopts the other's spelling — a
 * shim that stays is a second place for the two shapes to drift apart.
 */
function normalizeRegistries(config: LoadedConfig): ReadonlyMap<string, NormalizedRegistry> {
  const out = new Map<string, NormalizedRegistry>();
  for (const [namespace, registry] of config.registries) {
    out.set(namespace, {
      url: registry.url,
      ...(registry.index === null ? {} : { index: registry.index }),
      headers: registry.headers,
      params: registry.params,
    });
  }
  return out;
}

function loadFailure(node: WalkNode, doc: Extract<LoadedDoc, { ok: false }>): Diagnostic {
  const where = `${node.id} (${doc.redactedUrl})`;
  // Trailing punctuation is stripped because the caller appends its own — a
  // loader detail that ends in a full stop otherwise renders as "today..".
  const detail = doc.detail === undefined ? "" : `: ${doc.detail.replace(/[.!?]+$/, "")}`;
  switch (doc.reason) {
    case "too-large":
      return diag(
        "response-too-large",
        `${where} exceeded the ${LIMITS.responseBytes / (1024 * 1024)} MB response ceiling${detail}.`,
        { items: [node.id], path: doc.redactedUrl },
      );
    case "not-json":
      return diag("wire-invalid", `${where} did not return JSON${detail}.`, {
        items: [node.id],
        path: doc.redactedUrl,
      });
    case "status":
      return diag("fetch-failed", `${where} responded ${doc.status ?? "with an error"}${detail}.`, {
        items: [node.id],
        path: doc.redactedUrl,
      });
    case "network":
      return diag("fetch-failed", `${where} could not be reached${detail}.`, {
        items: [node.id],
        path: doc.redactedUrl,
      });
  }
}
