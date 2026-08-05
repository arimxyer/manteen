import { useEffect, useState } from "react";

export type Scheme = "dark" | "light";

/**
 * Follows whatever colour scheme the page is actually painted in.
 *
 * `data-theme` on <html> is the authoritative signal, not `prefers-color-scheme`: Starlight owns
 * that attribute, writes it before hydration, and updates it both when the reader uses the theme
 * toggle and when the OS preference changes under the "Auto" setting. Observing it means this
 * subtree always agrees with the rest of the page, including in the cases where Starlight decides
 * to stop following the OS (it pins to localStorage once the reader has expressed a preference).
 *
 * Reading it during render would be wrong twice over — it disagrees with the server, and on the
 * client it would report a value the browser has already painted against. Hence the effect, and
 * hence "dark" as the initial value: it is what the server renders and what an unset `data-theme`
 * resolves to.
 *
 * Second consumer of this rule (HeroShowcase and OwnershipPanel), which is why it lives here
 * rather than beside either of them.
 */
export function useStarlightScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>("dark");

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setScheme(root.dataset.theme === "light" ? "light" : "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return scheme;
}

/**
 * True once the component has mounted on the client.
 *
 * Used to render a server-safe tree on the first client pass (so hydration matches) and a
 * client-only tree afterwards. Deliberately not `typeof window !== "undefined"`, which would
 * differ between the server render and the hydration render and produce a mismatch.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
