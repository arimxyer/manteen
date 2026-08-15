"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One field, at one stage. `id` is the field's IDENTITY across all three stages
 * rather than its name at any one of them — `kind` and `type` are the same fact
 * spelled for two different readers, which is the entire claim this illustration
 * makes, so they share an id and the row travels instead of being replaced.
 */
type Row = { id: string; field: string; value: string; note?: string };

type Stage = { id: string; label: string; source: string; rows: Row[] };

/**
 * The same registry item in the three forms it takes, and every key here is a
 * real one.
 *
 * The first stage is the catalog from the Authoring band verbatim — the two
 * sections are deliberately showing one item, so a reader who scrolled past that
 * code block is watching *it* compile rather than a second example.
 *
 * The second stage is not written by hand. That catalog was compiled with the
 * kit (`bun packages/registry-kit/src/cli/index.ts build`) and the emitted
 * `release-panel.json` transcribed: field names, `registry:` values, and the
 * shape of `meta.mantine` are the compiler's, not a guess at the wire format.
 * Two things are elided rather than reworded — the schema URL keeps only its
 * final segment, and `files[].content` (the whole source file, inlined) is named
 * instead of printed. Both are noted where they are elided.
 *
 * The third stage is where `@ui/` lands: `TARGET_PLACEHOLDER` in the client's
 * `config/aliases.ts` routes it through the `ui` alias, whose default is
 * `@/components/ui` (`config/load.ts`). The on-disk path therefore depends on
 * the consumer's own tsconfig `paths`, which is why the row shows the import
 * specifier the project writes rather than pretending to know their layout.
 *
 * `$schema` appears in exactly one stage on purpose. It is the interop punchline
 * — it enters at compile time and it is why a client that has never heard of
 * Mantine can still install this — so it is the one row that visibly arrives.
 *
 * The rows are held in ONE order across all three stages rather than each
 * document's literal key order, and that is the only editorial decision here.
 * Serialization order is not the claim; the correspondence is. Letting the rows
 * re-sort per stage was the first version and it made `mantine` and `provider`
 * trade places with `dependencies` and `files` on the way to the compiled view —
 * so two rows crossed mid-flight and briefly rendered on top of each other,
 * which is illegible in exactly the frames a reader is watching. Held in place,
 * a row only ever moves by the height of a neighbour arriving or leaving, and
 * the eye can stay on one fact and watch it get re-spelled.
 */
const STAGES: Stage[] = [
  {
    id: "author",
    label: "You author",
    source: "manteen.registry.json",
    rows: [
      { id: "name", field: "name", value: "release-panel" },
      { id: "kind", field: "kind", value: "block" },
      { id: "deps", field: "npm", value: "@mantine/core@^9" },
      {
        id: "files",
        field: "files",
        value: "src/release-panel.tsx",
        note: "as component, target @ui/release-panel.tsx",
      },
      { id: "mantine", field: "mantine", value: ">=9 <10" },
      { id: "provider", field: "provider", value: "true" },
    ],
  },
  {
    id: "compiled",
    label: "Compiled",
    source: "/r/release-panel.json",
    rows: [
      { id: "schema", field: "$schema", value: "…/registry-item.json", note: "ui.shadcn.com" },
      { id: "name", field: "name", value: "release-panel" },
      { id: "kind", field: "type", value: "registry:block" },
      { id: "deps", field: "dependencies", value: "@mantine/core@^9" },
      {
        id: "files",
        field: "files",
        value: "src/release-panel.tsx",
        note: "registry:ui, content inlined",
      },
      { id: "mantine", field: "meta.mantine.requires", value: ">=9 <10" },
      { id: "provider", field: "meta.mantine.provider", value: "MantineProvider" },
    ],
  },
  {
    id: "installed",
    label: "Installed",
    source: "your project",
    rows: [
      { id: "name", field: "manteen.lock.json", value: "@acme/release-panel", note: "the receipt" },
      { id: "deps", field: "installed", value: "@mantine/core@^9" },
      {
        id: "files",
        field: "written",
        value: "@/components/ui/release-panel",
        note: "the ui alias, resolved through your tsconfig",
      },
      { id: "mantine", field: "compatibility", value: ">=9 <10", note: "checked before any write" },
      { id: "provider", field: "provider", value: "MantineProvider" },
    ],
  },
];

/**
 * Height held for the panel so switching stages cannot resize the band.
 *
 * Sized to the tallest stage — `compiled`, at seven rows — because the copy card
 * beside it is a grid sibling and would jump on every switch otherwise. The same
 * reason `TerminalPanel` takes a `reserve`.
 */
const RESERVE = "min-h-[26rem] sm:min-h-[23rem]";

export function InteropStages({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  const stage = STAGES[active] ?? STAGES[0];
  if (stage === undefined) return null;

  return (
    // `reducedMotion="user"` rather than a hook: it suppresses transform and
    // layout animation for a reader who asked for less motion while leaving
    // opacity alone, and it does so declaratively for every descendant — there
    // is no window to read, so it is correct on the server render too.
    <MotionConfig reducedMotion="user">
      <div className={cn("flex flex-col", className)}>
        <div className="mb-4 flex flex-row items-center gap-2">
          {/* Toggle buttons rather than a radiogroup: three independent
              `aria-pressed` controls are keyboard-operable with no roving
              tabindex to maintain, and the state they report — which
              representation is on screen — is exactly what pressed means. */}
          {STAGES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={index === active}
              onClick={() => setActive(index)}
              className={cn(
                "relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                index === active
                  ? "text-brand-foreground"
                  : "text-fd-muted-foreground hover:text-fd-foreground",
              )}
            >
              {index === active ? (
                // The one `layoutId` here. A single pill exists at a time and
                // moves between buttons, which is the case shared-element
                // matching is for — the rows below use `layout` instead,
                // because they live in one list and never change tree.
                <motion.span
                  layoutId="interop-stage-pill"
                  className="absolute inset-0 rounded-full bg-brand"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              {/* The pill paints over the button and the label paints over the
                  pill, ordered by position in a shared stacking context. The
                  obvious spelling — a negative z-index on the pill — sends it
                  behind the CARD's background rather than behind the label, and
                  the failure is theme-shaped: invisible against a light card,
                  survivable against a dark one, so it reads as a colour bug. */}
              <span className="relative">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border bg-fd-secondary">
          <div className="flex flex-row items-center gap-2 border-b p-2 text-fd-muted-foreground">
            <span className="font-mono text-xs">{stage.source}</span>
          </div>

          {/* Ligatures off, and not cosmetically: the mono face renders `>=` as a
              single `≥` glyph, so `">=9 <10"` — a real semver range a reader
              might copy — appears here as a character that is not in the file. */}
          <ul className={cn("flex flex-col gap-2 p-3 [font-variant-ligatures:none]", RESERVE)}>
            {/* Three things here, and each is load-bearing.
                `AnimatePresence` must be the direct parent of what exits, so it
                sits inside the list rather than around it. `popLayout` takes an
                exiting row out of flow immediately, which is what lets the rows
                below close the gap instead of waiting out the fade. And
                `initial={false}` keeps the panel still on arrival — the first
                render, the one that ships in the HTML, plays nothing, and only a
                stage the reader chose animates. That last one is the contract
                the install terminal already follows. */}
            <AnimatePresence initial={false} mode="popLayout">
              {stage.rows.map((row) => (
                <motion.li
                  key={row.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  // An arriving row is placed at its final slot immediately,
                  // while the rows it displaces are still sliding to meet it —
                  // so for a beat it sits on top of one of them. Holding its
                  // fade until the slide has largely run means the overlap
                  // happens while it is still invisible. Exits are quicker than
                  // entrances for the same reason, from the other end.
                  transition={{
                    layout: { type: "spring", stiffness: 380, damping: 36 },
                    opacity: { duration: 0.18, delay: 0.14 },
                  }}
                  className="rounded-lg border bg-fd-background/40 px-3 py-2"
                >
                  <div className="flex flex-col gap-x-3 sm:flex-row sm:items-baseline">
                    <code className="shrink-0 font-mono text-xs text-brand sm:w-44">
                      {row.field}
                    </code>
                    <code className="font-mono text-xs break-all text-fd-secondary-foreground">
                      {row.value}
                    </code>
                  </div>
                  {row.note ? (
                    <p className="mt-1 text-[11px] text-fd-muted-foreground">{row.note}</p>
                  ) : null}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </MotionConfig>
  );
}
