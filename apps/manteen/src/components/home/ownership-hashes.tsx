"use client";

import { MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One destination, and the four hashes `manteen diff` keeps for it.
 *
 * The names, the places they live and the one-line glosses are the docblock at
 * the top of `packages/cli/src/commands/diff.ts` — "four hashes per
 * destination, not two" is that file's own framing, and it is the claim this
 * illustration exists to make visible.
 *
 * `id` is the hash's IDENTITY, so a chip travels between lanes rather than
 * being replaced. That travel is the whole point: what separates when you edit
 * the file is not a label, it is which digests still agree.
 */
type HashId = "recorded" | "base" | "current" | "upstream";

type Source = { id: HashId; label: string; where: string };

const SOURCES: Record<HashId, Source> = {
  recorded: { id: "recorded", label: "recorded", where: "manteen.lock.json" },
  base: { id: "base", label: "base", where: ".manteen/bases/" },
  current: { id: "current", label: "current", where: "the bytes on disk now" },
  upstream: { id: "upstream", label: "upstream", where: "what the registry serves today" },
};

/**
 * Illustrative digests — a hash of nothing, deliberately short. Everything else
 * on this panel is lifted from the client's own source; these three exist only
 * so that "they agree" and "they do not" are readable at a glance, one digest
 * per lane, because sharing a lane IS sharing a hash.
 */
const DIGESTS = {
  installed: "4f2a1c8e",
  local: "a91c3d07",
  upstream: "7bd4e2f1",
} as const;

type LaneId = keyof typeof DIGESTS;

/**
 * The lanes are equivalence classes, not categories. A chip sits in the lane
 * whose digest it currently equals, so the arrangement is derived rather than
 * decorative: with nothing changed all four share one lane, and each toggle
 * pulls exactly one chip out of it.
 *
 * All three lanes are always on screen, empty ones included. That is what makes
 * the resting state teach the model — a reader who never touches a toggle still
 * sees that there are three ways this file can diverge and that none of them
 * has happened. It also keeps the panel's height near-constant for free: the
 * four chips are conserved, so a lane only grows by what another lane lost.
 */
const LANES: { id: LaneId; label: string; empty: string }[] = [
  { id: "installed", label: "As installed", empty: "" },
  { id: "local", label: "Your edit", empty: "you have not touched the file" },
  {
    id: "upstream",
    label: "Upstream today",
    empty: "the registry still serves what you installed",
  },
];

/**
 * The four reachable states, named by `FileChange` and `DiffFile.outcome` in
 * `packages/cli/src/inventory/types.ts`. Both unions are wider than this — eight
 * members each, covering a deleted file, a file upstream dropped, a file upstream
 * added, and an unreachable registry — and those are states of the world rather
 * than of the two switches, so they are not reachable here. The four that are
 * reachable are spelled exactly as the client spells them.
 *
 * `both` is the honest one: default update either proposes a clean merge or
 * refuses and names a conflict, and `outcome` is what says which. Showing only
 * `merged` would promise something the client does not.
 */
type StateId = "unchanged" | "local-only" | "upstream-only" | "both";

type State = {
  change: StateId;
  outcome: string[];
  detail: string;
  lanes: Record<LaneId, HashId[]>;
};

const STATES: Record<StateId, State> = {
  unchanged: {
    change: "unchanged",
    outcome: ["up-to-date"],
    detail: "No file needs a write, and no local adaptation needs calling out.",
    lanes: {
      installed: ["recorded", "base", "current", "upstream"],
      local: [],
      upstream: [],
    },
  },
  "local-only": {
    change: "local-only",
    outcome: ["local-only"],
    detail: "Local adaptations exist, but upstream did not move — update preserves them.",
    lanes: {
      installed: ["recorded", "base", "upstream"],
      local: ["current"],
      upstream: [],
    },
  },
  "upstream-only": {
    change: "upstream-only",
    outcome: ["upstream-only"],
    detail: "Cleanly updatable — the bytes on disk are still the ones Manteen wrote.",
    lanes: {
      installed: ["recorded", "base", "current"],
      local: [],
      upstream: ["upstream"],
    },
  },
  both: {
    change: "both",
    outcome: ["merged", "conflict"],
    detail:
      "Both moved. Update proposes a merge around your edit against the pristine base, or refuses and tells you where they collided.",
    lanes: {
      installed: ["recorded", "base"],
      local: ["current"],
      upstream: ["upstream"],
    },
  },
};

function resolve(edited: boolean, moved: boolean): State {
  if (edited && moved) return STATES.both;
  if (edited) return STATES["local-only"];
  if (moved) return STATES["upstream-only"];
  return STATES.unchanged;
}

/**
 * Held so that toggling cannot resize the band — the copy card beside this one
 * is a grid sibling and would jump on every switch.
 *
 * Small, and deliberately so: the four chips are conserved, so the panel's
 * measured height varies by six pixels across all four states and the reserve
 * only has to cover that. A generous one would be dead space in every state
 * rather than slack in one.
 */
const RESERVE = "min-h-[19rem] sm:min-h-[17.5rem]";

const SPRING = { type: "spring", stiffness: 380, damping: 36 } as const;

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        pressed
          ? "border-brand bg-brand/10 text-brand"
          : "text-fd-muted-foreground hover:text-fd-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full transition-colors",
          pressed ? "bg-brand" : "bg-fd-muted-foreground/40",
        )}
        aria-hidden="true"
      />
      {children}
    </button>
  );
}

export function OwnershipHashes({ className }: { className?: string }) {
  const [edited, setEdited] = useState(false);
  const [moved, setMoved] = useState(false);
  const state = resolve(edited, moved);

  return (
    // Declarative rather than a hook: no window to read, so it is correct on the
    // server render, and it drops the travel while keeping the fades for a
    // reader who asked for less motion.
    <MotionConfig reducedMotion="user">
      <div className={cn("flex flex-col", className)}>
        <div className="mb-4 flex flex-row flex-wrap items-center gap-2">
          {/* Two independent switches rather than four preset states: the
              states are a truth table over these two facts, and letting a
              reader set each one separately is what shows that. `aria-pressed`
              reports exactly what pressed means here. */}
          <Toggle pressed={edited} onClick={() => setEdited((value) => !value)}>
            You edited it
          </Toggle>
          <Toggle pressed={moved} onClick={() => setMoved((value) => !value)}>
            Upstream moved
          </Toggle>
        </div>

        <div className={cn("overflow-hidden rounded-xl border bg-fd-secondary", RESERVE)}>
          {/* Ligatures off for the same reason the interop panel turns them
              off: this face renders literal path and digest text, and a
              composed glyph would put a character on screen that is not in the
              data. */}
          <div className="flex flex-row items-center gap-2 border-b p-2 [font-variant-ligatures:none]">
            <span className="font-mono text-xs text-fd-muted-foreground">
              @/components/ui/release-panel.tsx
            </span>
          </div>

          <div className="flex flex-col gap-2 p-3 [font-variant-ligatures:none]">
            {LANES.map((lane) => {
              const members = state.lanes[lane.id];
              return (
                <motion.div
                  key={lane.id}
                  layout
                  transition={SPRING}
                  className={cn(
                    "rounded-lg border px-3 py-2 transition-colors",
                    members.length > 0
                      ? "border-fd-border bg-fd-background/40"
                      : "border-dashed bg-transparent",
                  )}
                >
                  <div className="flex flex-row items-baseline justify-between gap-3">
                    <span className="text-[11px] font-medium tracking-wide text-fd-foreground uppercase">
                      {lane.label}
                    </span>
                    {members.length > 0 ? (
                      <code className="font-mono text-xs text-brand">{DIGESTS[lane.id]}…</code>
                    ) : (
                      <span className="text-[11px] text-fd-muted-foreground">{lane.empty}</span>
                    )}
                  </div>

                  {members.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {members.map((id) => (
                        // `layoutId`, not `layout`: a chip genuinely changes
                        // parent when it leaves a lane, and matching it across
                        // trees is the one thing `layout` alone cannot do. The
                        // rows in the interop panel are the opposite case and
                        // use `layout` for it.
                        <motion.li
                          key={id}
                          layoutId={`ownership-hash-${id}`}
                          layout
                          transition={SPRING}
                          className="flex flex-row flex-wrap items-baseline gap-x-3 gap-y-0.5"
                        >
                          <code className="w-20 shrink-0 font-mono text-xs text-fd-secondary-foreground">
                            {SOURCES[id].label}
                          </code>
                          <span className="text-[11px] text-fd-muted-foreground">
                            {SOURCES[id].where}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        </div>

        <motion.div layout transition={SPRING} className="mt-3 flex flex-col gap-1 text-xs">
          <div className="flex flex-row flex-wrap items-baseline gap-x-4 gap-y-1 [font-variant-ligatures:none]">
            <span className="text-fd-muted-foreground">
              change <code className="ml-1 font-mono text-brand">{state.change}</code>
            </span>
            <span className="text-fd-muted-foreground">
              update{" "}
              {state.outcome.map((value, index) => (
                <span key={value}>
                  {index > 0 ? " or " : " "}
                  <code className="font-mono text-brand">{value}</code>
                </span>
              ))}
            </span>
          </div>
          <p className="text-fd-muted-foreground">{state.detail}</p>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
