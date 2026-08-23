"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { InteropVariantProps } from "./types";

/**
 * Reader — one document, two readings.
 *
 * The artifact is a real published item document, `/r/password-strength.json`. Every
 * key, value and count was transcribed from that compiled output and cross-checked
 * against the source catalog entry in `manteen.registry.json`, so the two agree:
 * three npm dependencies, two files, `requires: ">=9"`, `provider: "MantineProvider"`,
 * six declared Styles API selectors and nine documented props. Values long enough to
 * swamp the panel are elided with an ellipsis and their omission is stated, never
 * reworded.
 *
 * The composition is a FOLIO, not a code panel. A narrow spine on the left carries
 * the interchange core — set once, tight, and physically beside the changing region
 * rather than above it, so no expansion can move it even in principle. The leaf to
 * its right is the `meta` region, and it unfolds from a fixed crease.
 *
 * Two devices are deliberately absent. Labelled boxes joined by arrows, because the
 * production `Interop` card's own comment records that as what made it assert its
 * claim in the same voice as the copy beside it. And any colour difference carrying
 * meaning, because the failure mode this concept has to avoid is reading as syntax
 * highlighting: the transform is geometric — a leaf that opens — and semantic — a
 * consequence sentence appears — and never a tint.
 *
 * Scope note. This illustration owns DEPTH only: the same object is opaque to one
 * reader and consequential to another. What happens when one of those fields is
 * malformed — which fail closed, which degrade — is a different question and belongs
 * to a different illustration; nothing here teaches it.
 */

/** The two readings. `manteen` is the settled default; parking in the generic reading
 *  would present the shallower outcome as the norm and invert the claim. */
type Reading = "generic" | "manteen";

/**
 * Local eases and springs rather than the `--ease-out` custom property.
 *
 * `global.css` belongs to the site, not to this prototype, and a variant that needs a
 * token added there is a variant that cannot be discarded cheaply. The curve is the
 * one `--ease-out` carries, spelled here so this file is self-contained.
 */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const PILL_SPRING = { type: "spring", stiffness: 420, damping: 38, mass: 0.9 } as const;

/**
 * The interchange core: §2.3's set, and the illustration's invariant.
 *
 * Rendered outside every animated subtree, with no motion props at all. The stillness
 * is the claim, so it is enforced structurally rather than by keeping two sets of
 * animation values matched and hoping a later edit does not break the match.
 */
const CORE = [
  { key: "$schema", value: '"…/registry-item.json"' },
  { key: "name", value: '"password-strength"' },
  { key: "type", value: '"registry:ui"' },
  { key: "dependencies", value: "[ … ] · 3" },
  { key: "files", value: "[ … ] · 2" },
] as const;

/**
 * The Manteen reading, as four entries rather than five keys.
 *
 * `props` and `usage` share one entry because they share one consequence — `info`
 * shows them — and a note per key would be four words of difference stated twice.
 * Both keys are still printed, because every visible key has to be byte-identical to
 * the document; only the annotation is pooled.
 *
 * Each consequence is one sentence about what Manteen DOES with the field. None of
 * them describes a malformed field: that is another illustration's subject.
 */
const FOLIO = [
  {
    id: "requires",
    keys: ['"requires"'],
    value: '">=9"',
    note: "Gates the install against the @mantine/core already in the project, before a byte is written.",
  },
  {
    id: "provider",
    keys: ['"provider"'],
    value: '"MantineProvider"',
    note: "Warns when nothing in the project mounts one.",
  },
  {
    id: "stylesApi",
    keys: ['"stylesApi"'],
    value: '{ "PasswordStrength": […] }',
    note: "Reports the six selectors the author declared.",
  },
  {
    id: "props-usage",
    keys: ['"props"', '"usage"'],
    value: "9 documented · 1 example",
    note: "Surfaced by manteen info.",
  },
] as const;

/**
 * Verbatim from the vendored interchange schema,
 * `packages/registry-kit/schema/wire/registry-item.schema.json`.
 *
 * Quoted rather than paraphrased because it is the entire reason the generic reading
 * is shallow: there is nothing declared in the region to read. A sentence asserting
 * that would be the card arguing; the declaration itself is the card showing.
 */
const META_SCHEMA_LINE = '"meta": { "type": "object", "additionalProperties": true }';

const READINGS = [
  { id: "generic", label: "Generic client" },
  { id: "manteen", label: "Manteen" },
] as const satisfies readonly { id: Reading; label: string }[];

/**
 * Height held for the leaf, so switching readings cannot resize the card.
 *
 * Three steps rather than one, and all three are container-relative, because what
 * decides how far a consequence sentence wraps is the width of this panel and
 * nothing else. Each was set from the measured leaf at that step's worst case —
 * the Manteen reading, whose four annotations are always the taller of the two —
 * with the values checked across seventeen widths from 320 to 1440 so no width
 * leaves the two readings a different height.
 *
 * Same reason as `RESERVE` in `interop-stages.tsx`: the copy card is a grid sibling
 * and would jump on every selection otherwise.
 */
const RESERVE = "min-h-[20.5rem] @min-[22rem]:min-h-[15rem] @min-[31rem]:min-h-[16rem]";

export function ReaderVariant({ reduceMotion }: InteropVariantProps) {
  const [reading, setReading] = useState<Reading>("manteen");
  const groupName = useId();

  /**
   * Reduced motion renders both readings at once and animates neither.
   *
   * `MotionConfig reducedMotion="always"` is not sufficient on its own — §4 records
   * that it deliberately leaves opacity alone, so an `AnimatePresence` swap would
   * still crossfade. The branch below removes `AnimatePresence` from the tree
   * entirely and passes `initial={false}` to what remains, so there is no exit to
   * fade and no enter to fade in. The region is simply complete.
   */
  const still = reduceMotion;

  const leafTransition = { duration: 0.26, ease: EASE_OUT } as const;

  /**
   * The unfold, and nothing at all when the reader asked for less motion.
   *
   * A leaf hinged on the crease above it: it comes down about its own top edge
   * rather than fading in place, which is the difference between a document being
   * opened and a panel being swapped. `transformPerspective` belongs on the
   * animating element itself — set on the parent it is inherited by every child at
   * once and flattens the hinge into a scale.
   *
   * The still case passes `initial={false}` AND an animate target with no transform
   * in it, so motion writes no `matrix3d` and the leaf is never promoted to its own
   * compositing layer. Leaving the identity transform in place is visually
   * indistinguishable and is exactly the kind of layer that softens small type.
   */
  const leafMotion = still
    ? { initial: false as const, animate: { opacity: 1 }, exit: undefined }
    : {
        initial: { opacity: 0, rotateX: -14, transformPerspective: 1100 },
        animate: { opacity: 1, rotateX: 0, transformPerspective: 1100 },
        exit: { opacity: 0, rotateX: -10, transition: { duration: 0.14, ease: EASE_OUT } },
      };

  const manteenLeaf = (
    <motion.div
      key="manteen"
      initial={leafMotion.initial}
      animate={leafMotion.animate}
      exit={leafMotion.exit}
      transition={leafTransition}
      className="origin-top"
    >
      <ul className="flex flex-col gap-3.5">
        {FOLIO.map((entry, index) => (
          <motion.li
            key={entry.id}
            initial={still ? false : { opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            /* Stagger on entry only. An exit delay is what makes rapid reselection
               feel stuck — a row waiting out its turn to leave while the other
               reading is already arriving — so the exit is one fade on the leaf and
               these carry none. */
            transition={{ duration: 0.22, ease: EASE_OUT, delay: still ? 0 : 0.05 + index * 0.05 }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {entry.keys.map((key) => (
                <code key={key} className="font-mono text-[12px] text-brand">
                  {key}
                </code>
              ))}
              <code className="font-mono text-[11px] wrap-break-word text-fd-secondary-foreground/85">
                {entry.value}
              </code>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-fd-secondary-foreground">
              {entry.note}
            </p>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );

  const genericLeaf = (
    <motion.div
      key="generic"
      initial={leafMotion.initial}
      animate={leafMotion.animate}
      exit={leafMotion.exit}
      transition={leafTransition}
      className={cn("origin-top", still && "mt-6 border-t border-dashed pt-5")}
    >
      {/* Under reduced motion this same leaf is the adjacent note the settled still
          needs, so it says which reading it is. Under motion the control above has
          already said so and a heading here would repeat it. */}
      {still ? (
        <p className="mb-3 font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
          The generic reading
        </p>
      ) : null}

      <code className="block font-mono text-[11px] leading-relaxed wrap-break-word text-fd-secondary-foreground/85">
        {META_SCHEMA_LINE}
      </code>
      <p className="mt-3 text-[13px] leading-snug text-fd-secondary-foreground">
        The interchange schema declares the region and stops there. Nothing is declared inside it to
        read.
      </p>
      <p className="mt-2.5 text-[13px] leading-snug text-fd-secondary-foreground">
        So a client that has never heard of Mantine writes the two files, installs the three
        dependencies, and is finished. It is not skipping a payload — it is reading the document to
        the depth the schema describes.
      </p>
    </motion.div>
  );

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      <div className="flex min-w-0 flex-col">
        {/* Under reduced motion there is no second state to select — both readings are
            on screen — so a control here would be an affordance that changes nothing.
            It is removed rather than disabled, and the caption naming what is shown
            takes its place. Under motion it is the real control, and the only thing
            in this card that can start an animation. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {still ? (
            <p className="font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
              Both readings
            </p>
          ) : (
            /* A real radio group rather than two `aria-pressed` toggles: the two
               positions are one value with two settings, which is what a radio group
               is, and native inputs bring arrow-key traversal, the group
               announcement and the checked/focused distinction for free with no
               roving tabindex to maintain. The pill is layout only; the input
               carries the semantics and stays `sr-only` rather than `hidden` so it
               remains focusable. */
            <fieldset className="min-w-0">
              <legend className="sr-only">Reader</legend>
              <div className="flex items-center gap-1 rounded-full border bg-fd-secondary p-1">
                {READINGS.map((option) => {
                  const active = option.id === reading;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "relative cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-fd-card motion-reduce:transition-none",
                        active ? "text-brand-foreground" : "text-fd-muted-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name={groupName}
                        value={option.id}
                        checked={active}
                        onChange={() => setReading(option.id)}
                        className="sr-only"
                      />
                      {active ? (
                        /* One pill exists at a time and moves between the two labels,
                           which is what shared-element matching is for. It springs
                           rather than eases, so a reader who reselects mid-flight
                           retargets it from wherever it currently is instead of
                           restarting a fixed-duration slide. */
                        <motion.span
                          layoutId="reader-reading-pill"
                          className="absolute inset-0 rounded-full bg-brand"
                          transition={PILL_SPRING}
                        />
                      ) : null}
                      {/* Pill over the label's background, text over the pill, ordered
                          by position in one stacking context. A negative z-index on
                          the pill sends it behind the CARD instead — invisible in
                          light, survivable in dark, and it reads as a colour bug. */}
                      <span className="relative">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <p className="font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
            One document · two readings
          </p>
        </div>

        {/* A container, not a viewport breakpoint, and the difference is measurable.
            This card is a grid sibling: between 1024px and roughly 1180px the page
            splits into two columns and the card halves to about 460px while the
            VIEWPORT is at its widest. Keyed to `sm` the spine stayed beside the leaf
            exactly where there was no room for it, every consequence wrapped to three
            lines, and the two readings differed by 56px — a reserve that held at
            1280 and at 390 and failed only in between. The container query asks the
            question that actually decides the layout: how wide is this panel. */}
        <div className="@container overflow-hidden rounded-xl border bg-fd-secondary">
          <div className="flex flex-row items-baseline justify-between gap-3 border-b px-4 py-2.5">
            <span className="min-w-0 truncate font-mono text-xs text-fd-muted-foreground">
              /r/password-strength.json
            </span>
            {/* Dropped rather than truncated below the two-column threshold. At 320px
                the strip cannot hold both, and the one that has to survive is the
                filename: it is the artifact's identity and the whole card is a claim
                about that one document. */}
            <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.12em] text-fd-muted-foreground uppercase @min-[22rem]:inline">
              published
            </span>
          </div>

          {/* Ligatures off, and not cosmetically: the mono face renders `>=` as a
              single `≥` glyph, so `">=9"` — the real range this item declares — would
              appear here as a character that is not in the document. */}
          <div className="grid grid-cols-1 [font-variant-ligatures:none] @min-[31rem]:grid-cols-[11.75rem_minmax(0,1fr)]">
            {/* The spine. Beside the leaf rather than above it, so the region that
                changes depth cannot displace the region that does not — the invariant
                is a fact about the layout, not a promise about the animation. */}
            <div className="border-b px-4 py-4 @min-[31rem]:border-r @min-[31rem]:border-b-0">
              <p className="font-mono text-[10px] tracking-[0.14em] text-fd-muted-foreground uppercase">
                Core
              </p>
              <dl className="mt-3 flex flex-row flex-wrap gap-x-5 gap-y-2.5 @min-[31rem]:flex-col @min-[31rem]:gap-x-0">
                {CORE.map((row) => (
                  <div key={row.key} className="min-w-0">
                    <dt className="font-mono text-[11px] text-brand">{row.key}</dt>
                    <dd className="font-mono text-[11px] wrap-break-word text-fd-secondary-foreground">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* The leaf. */}
            <div className="px-4 py-4">
              {/* The crease, and what is folded shut against it. This row never
                  unmounts and never dims in either reading: a generic client ignoring
                  the region is not the same as losing it, and dimming the marker is
                  exactly how an illustration says the wrong one. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-3">
                <span className="flex items-baseline gap-2">
                  <code className="font-mono text-[12px] text-brand">&quot;meta&quot;</code>
                  <code className="font-mono text-[12px] text-fd-secondary-foreground">
                    {"{ … }"}
                  </code>
                </span>
                <span className="font-mono text-[9px] tracking-[0.1em] whitespace-nowrap text-fd-muted-foreground uppercase">
                  one object · both readings
                </span>
              </div>

              <div className={cn("relative pt-4", RESERVE)}>
                {still ? (
                  <>
                    {manteenLeaf}
                    {genericLeaf}
                  </>
                ) : (
                  /* `initial={false}` is the homepage contract and is what makes the
                     first paint a truthful still: the settled Manteen reading ships in
                     the HTML and plays nothing. One consequence worth stating — the
                     harness's replay control is intentionally inert for this variant,
                     because a remount is still a first mount and this card has no
                     sequence to restart. */
                  <AnimatePresence initial={false} mode="popLayout">
                    {reading === "manteen" ? manteenLeaf : genericLeaf}
                  </AnimatePresence>
                )}
              </div>
            </div>
          </div>

          {/* The footnote, and it is doing real work rather than decorating the foot
              of the panel: two values here are shortened, and an illustration whose
              whole claim is that its keys are byte-identical to a published document
              has to say which of its values are not printed whole. */}
          <p className="border-t px-4 py-2 font-mono text-[10px] leading-relaxed text-fd-muted-foreground">
            Schema URL shortened, file contents inlined. Every other value is verbatim from the
            compiled document.
          </p>
        </div>

        <p className="sr-only">
          One published registry item document, /r/password-strength.json, read at two depths. Its
          interchange core — $schema, name, type, dependencies and files — is identical in both
          readings and is what a client that has never heard of Mantine installs. The meta object is
          present in both readings and is never removed. Under a generic reading, the interchange
          schema declares meta as an object with additionalProperties true and nothing further, so
          there is no declared structure inside it to read; that client writes the two files,
          installs the three dependencies, and is finished. Under Manteen&apos;s reading the same
          object opens into the behaviour those fields cause: requires gates the install against the
          Mantine already in the project, provider warns when nothing mounts one, stylesApi reports
          the six selectors the author declared, and props and usage are surfaced by manteen info.
          Nothing is added, removed or relabelled between the two readings. Only the depth changes.
        </p>
      </div>
    </MotionConfig>
  );
}
