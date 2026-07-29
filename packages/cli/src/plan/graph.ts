/**
 * Graph shape for the resolver: which items form cycles, and what order items
 * come out in.
 *
 * PURE — no `node:fs`, no `fetch`, no clock. Both functions are total: given the
 * same nodes and edges they return the same arrays, and neither throws on a
 * malformed graph. That totality is load-bearing, because `resolve()` is
 * asserted byte-identical across fifty runs with randomized loader delays; a
 * function whose output depended on insertion order would fail that test
 * roughly once per fifty runs and look like a flake.
 *
 * Edge direction, once, because getting it backwards is silent: `dependsOn` maps
 * an item to the items it NEEDS. `topoSort` therefore emits a node only after
 * every node it depends on, which is the order the write list and the theme fold
 * both require (D6 — `prefer: "base"` is first-write-wins, so a dependency's
 * theme fragment must land before its dependent's).
 *
 * Ordering is always UTF-16 code-unit order — the default `Array#sort()`
 * comparator — and NEVER `localeCompare`, whose result depends on the ambient
 * locale and would make a plan reproducible only on the machine that made it.
 */
import type { CanonicalId } from "./types";

/** Item -> the items it depends on. Entries naming an unknown node are ignored. */
export type DependsOn = ReadonlyMap<CanonicalId, readonly CanonicalId[]>;

/** Locale-independent, matches the default `Array#sort()` comparator. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Neighbours of `node`, deduped, restricted to nodes we actually have, sorted.
 *
 * Restricting matters: a `registryDependencies` entry that failed to load has no
 * node, and counting it would leave its dependent permanently blocked in Kahn's
 * algorithm — the item would then only ever be emitted by the cycle-breaking
 * branch, mislabelled.
 */
function edgesOf(
  node: CanonicalId,
  dependsOn: DependsOn,
  known: ReadonlySet<CanonicalId>,
): CanonicalId[] {
  const out = new Set<CanonicalId>();
  for (const dep of dependsOn.get(node) ?? []) {
    if (known.has(dep)) out.add(dep);
  }
  return [...out].sort(byCodeUnit);
}

/**
 * Every cycle in the graph, as its strongly-connected component (Tarjan).
 *
 * Returns SCCs of size > 1 plus any single node that depends on itself. Members
 * within a cycle are sorted; cycles are sorted by their first member.
 *
 * Cycles WARN and never refuse (D25): we copy files, we do not evaluate them, so
 * a cyclic import graph is legal TypeScript and refusing it would block a valid
 * registry. Recursion is bounded by the resolver's 200-node ceiling.
 */
export function findCycles(nodes: readonly CanonicalId[], dependsOn: DependsOn): CanonicalId[][] {
  const known = new Set(nodes);
  const index = new Map<CanonicalId, number>();
  const low = new Map<CanonicalId, number>();
  const onStack = new Set<CanonicalId>();
  const stack: CanonicalId[] = [];
  const cycles: CanonicalId[][] = [];
  let counter = 0;

  const strongConnect = (v: CanonicalId): void => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of edgesOf(v, dependsOn, known)) {
      if (!index.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
      }
    }

    if (low.get(v) !== index.get(v)) return;

    const component: CanonicalId[] = [];
    for (;;) {
      const w = stack.pop();
      if (w === undefined) break;
      onStack.delete(w);
      component.push(w);
      if (w === v) break;
    }

    const selfLoop = component.length === 1 && edgesOf(v, dependsOn, known).includes(v);
    if (component.length > 1 || selfLoop) cycles.push(component.sort(byCodeUnit));
  };

  for (const node of [...nodes].sort(byCodeUnit)) {
    if (!index.has(node)) strongConnect(node);
  }

  return cycles.sort((a, b) => byCodeUnit(a[0] ?? "", b[0] ?? ""));
}

/**
 * Kahn's algorithm with a lexicographic tiebreak, total on cyclic input.
 *
 * Every node in `nodes` appears exactly once. When several nodes are ready at
 * the same time the smallest canonical id wins — that tiebreak, not the loader's
 * completion order, is what makes `add @product/alert-panel` print
 * `@base/empty-state`, `@kit/callout`, `@product/alert-panel` on every run.
 *
 * When the ready set empties with nodes still remaining, the graph has a cycle.
 * Rather than throw — D25 says cycles warn — the smallest remaining id is
 * emitted and the walk continues, so SCC members come out in id order and the
 * caller still gets a defined total order. `findCycles` is what reports it.
 */
export function topoSort(nodes: readonly CanonicalId[], dependsOn: DependsOn): CanonicalId[] {
  const known = new Set(nodes);
  const remaining = new Set(known);
  const pending = new Map<CanonicalId, number>();
  const dependents = new Map<CanonicalId, CanonicalId[]>();

  for (const node of known) {
    const deps = edgesOf(node, dependsOn, known);
    pending.set(node, deps.length);
    for (const dep of deps) {
      const list = dependents.get(dep);
      if (list) list.push(node);
      else dependents.set(dep, [node]);
    }
  }

  const order: CanonicalId[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((n) => (pending.get(n) ?? 0) === 0).sort(byCodeUnit);
    const next = ready[0] ?? [...remaining].sort(byCodeUnit)[0];
    if (next === undefined) break;

    order.push(next);
    remaining.delete(next);
    for (const dependent of dependents.get(next) ?? []) {
      pending.set(dependent, (pending.get(dependent) ?? 1) - 1);
    }
  }

  return order;
}
