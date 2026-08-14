"use client";

import { Water } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

/**
 * Water caustics behind the hero.
 *
 * This renders on top of the CSS `hero-grid` / `hero-glow` layers rather than replacing them:
 * WebGL can be unavailable, blocked, or still mounting, and the hero has to look designed in
 * every one of those states. Nothing here is load-bearing for legibility — the copy sits on its
 * own scrim.
 */

/**
 * Deep water below, lit surface above.
 *
 * The light palette is a mid blue rather than the pale tint the surrounding page uses: caustics
 * are a contrast effect, and against a near-white background they wash out into a flat gradient.
 * The copy stays legible because it sits on the scrim, not on the water.
 */
const palette = {
  light: { colorBack: "#8ec2f0", colorHighlight: "#ffffff" },
  dark: { colorBack: "#0a1b33", colorHighlight: "#7cc2ff" },
} as const;

/** `next-themes` writes this class on <html>; reading the DOM avoids depending on it directly. */
function readIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function HeroWater() {
  const [isDark, setIsDark] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setIsDark(readIsDark());
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const observer = new MutationObserver(() => setIsDark(readIsDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Rendering nothing until the theme is known keeps the first paint from flashing the wrong
  // water. The CSS layers underneath are already painted, so there is no empty frame.
  if (isDark === null) return null;

  const colors = isDark ? palette.dark : palette.light;

  return (
    <Water
      className="absolute inset-0 size-full"
      width="100%"
      height="100%"
      {...colors}
      highlights={isDark ? 0.16 : 0.24}
      layering={0.5}
      edges={0.8}
      waves={0.35}
      caustic={0.5}
      size={1.4}
      scale={0.9}
      // A still frame rather than no shader at all: reduced motion asks for no animation, not
      // for a blank hero.
      speed={reducedMotion ? 0 : 0.35}
      frame={reducedMotion ? 4200 : 0}
      // Caps the render target on high-DPI displays. Without it the hero allocates a buffer
      // proportional to devicePixelRatio squared, which is the whole GPU cost of this effect.
      maxPixelCount={1280 * 720}
      minPixelRatio={1}
    />
  );
}
