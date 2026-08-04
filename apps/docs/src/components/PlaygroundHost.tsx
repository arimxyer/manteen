import { Component, lazy, type ReactNode, Suspense, useMemo } from "react";

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

type LoadErrorBoundaryProps = { children: ReactNode };
type LoadErrorBoundaryState = { failed: boolean };

// Wraps the lazy adapter render, not the whole host: an unknown item (below) is an authoring
// bug and must keep throwing loudly in dev, while a chunk that fails to fetch or hydrate (a
// stale dev server, a flaky network) is a runtime condition a reader can recover from with a
// reload. Class component because React only recognizes componentDidCatch/getDerivedStateFromError
// as an error boundary — there is no hooks equivalent.
class PlaygroundLoadBoundary extends Component<LoadErrorBoundaryProps, LoadErrorBoundaryState> {
  state: LoadErrorBoundaryState = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[PlaygroundHost] live preview failed to load", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className={styles.placeholder}
          data-preview-error="true"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            padding: "1.5rem",
            textAlign: "center",
            color: "var(--manteen-text-faint)",
            fontSize: "var(--manteen-text-sm)",
          }}
        >
          <p style={{ margin: 0 }}>The live preview failed to load. Refresh the page to retry.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "2.25rem",
              padding: "0 0.85rem",
              border: "1px solid var(--manteen-border)",
              borderRadius: "var(--manteen-radius-sm)",
              background: "var(--manteen-panel-active)",
              color: "var(--manteen-text)",
              fontSize: "var(--manteen-text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
    <PlaygroundLoadBoundary>
      <Suspense fallback={<div className={styles.placeholder} aria-hidden="true" />}>
        <Adapter />
      </Suspense>
    </PlaygroundLoadBoundary>
  );
}
