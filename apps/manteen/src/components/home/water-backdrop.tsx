"use client";

import { Water } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Water caustics behind a panel.
 *
 * This renders on top of the CSS `hero-grid` / `hero-glow` layers rather than replacing them:
 * WebGL can be unavailable, blocked, or still mounting, and a panel has to look designed in
 * every one of those states. Nothing here is load-bearing for legibility — copy sits on its
 * own scrim.
 *
 * Two instances on one page cost about what one costs. `@paper-design/shaders` observes each
 * mount with an IntersectionObserver and on `visibilitychange`, and cancels the animation frame
 * whenever the element is off-screen or the tab is hidden (`shader-mount.js`,
 * `updateCurrentSpeed`). The hero and the closing panel are never on screen together, so at most
 * one is ever running.
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

/**
 * `hero` is the page's signature moment and is tuned for a 70vh panel. `panel` is the reprise at
 * the foot of the page, and differs where the smaller panel demands it: dimmer highlights, a
 * little slower, and much broader features pulled closer in, because detail that reads as water
 * across 600px reads as noise across 250. A bookend works only while the second instance stays
 * quieter than the first — which is a constraint on `panel`, not on `hero`.
 */
const variants = {
  hero: { highlightsDark: 0.16, highlightsLight: 0.24, speed: 0.35, size: 1.4, scale: 0.9 },
  panel: { highlightsDark: 0.11, highlightsLight: 0.17, speed: 0.3, size: 2.6, scale: 0.7 },
} as const;

export type WaterVariant = keyof typeof variants;

/** `next-themes` writes this class on <html>; reading the DOM avoids depending on it directly. */
function readIsDark() {
  return document.documentElement.classList.contains("dark");
}

export function WaterBackdrop({
  variant = "hero",
  className,
}: {
  variant?: WaterVariant;
  /** Override the corner radius when the containing panel does not use `rounded-2xl`. */
  className?: string;
}) {
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
  const look = variants[variant];

  return (
    <Water
      // The rounding is repeated here rather than inherited from the panel. A WebGL canvas is
      // composited on its own layer, and an ancestor's `overflow-hidden` + `border-radius` is
      // not reliably applied to one across engines — Chromium clips it, others leave the
      // canvas's square corners showing through the panel's rounded ones. Clipping at the
      // shader's own wrapper, which is the canvas's direct parent, does not depend on that.
      // Keep this radius in step with the panel's.
      className={cn("absolute inset-0 size-full overflow-hidden rounded-2xl", className)}
      width="100%"
      height="100%"
      {...colors}
      highlights={isDark ? look.highlightsDark : look.highlightsLight}
      layering={0.5}
      edges={0.8}
      waves={0.35}
      caustic={0.5}
      size={look.size}
      scale={look.scale}
      // A still frame rather than no shader at all: reduced motion asks for no animation, not
      // for a blank panel. Speed 0 also cancels the render loop outright, so the still frame
      // costs one draw rather than a paused one.
      speed={reducedMotion ? 0 : look.speed}
      frame={reducedMotion ? 4200 : 0}
      // Caps the render target on high-DPI displays. Without it each panel allocates a buffer
      // proportional to devicePixelRatio squared, which is the whole GPU cost of this effect.
      maxPixelCount={1280 * 720}
      minPixelRatio={1}
    />
  );
}
