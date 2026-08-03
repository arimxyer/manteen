import { lazy, Suspense, useMemo } from "react";

import { Playground } from "./Playground";
import styles from "./PlaygroundShell.module.css";
import type { PlaygroundAdapter } from "./playgrounds/contract";

/**
 * Astro can only hydrate statically imported components, so the dynamic part lives one level
 * down: this host is the (static) island, and it lazy-loads its item's adapter chunk from the
 * same glob the server-side gates read. `client:only` because a React.lazy subtree has nothing
 * useful to SSR and the adapters are pure browser code anyway; the placeholder reserves the
 * box so the page does not jump when the island hydrates.
 */
const adapterModules = import.meta.glob<{ default: PlaygroundAdapter }>(
  "./playgrounds/*.playground.tsx",
);

export default function PlaygroundHost({ item }: { item: string }) {
  const Adapter = useMemo(() => {
    const load = adapterModules[`./playgrounds/${item}.playground.tsx`];
    if (!load) return null;
    return lazy(async () => {
      const module = await load();
      return { default: () => <Playground adapter={module.default} /> };
    });
  }, [item]);

  // An unknown item is a wiring bug, not a render decision: the .astro gate already checked
  // the same glob, so refuse loudly instead of quietly rendering nothing.
  if (!Adapter) {
    throw new Error(`No playground adapter found for item "${item}".`);
  }

  return (
    <Suspense fallback={<div className={styles.placeholder} aria-hidden="true" />}>
      <Adapter />
    </Suspense>
  );
}
