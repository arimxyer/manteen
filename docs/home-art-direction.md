# Home page art direction — "Specimen"

> **Status: partly superseded. Read the per-section markers.**
>
> "Specimen" was the first written direction and it produced three concepts — A "Ledger",
> B "Index", and C — all now deleted along with `specimen.css`. Direction D is the one that
> shipped (`components/home/HeroRadix.astro`), and it kept this document's diagnosis, voice,
> motion rule, material rule and Manny rule while replacing its **Type** and **Motif** sections
> outright.
>
> The replacement is not a drift to be corrected: a reference sweep of twenty-five component
> library and dev-tool sites (`notes/home-hero-research`) found the uppercase-tracked-mono label
> system this document prescribes on **zero** of them. It was costume rather than design language.
> The live type and colour decisions now live in `apps/docs/src/styles/home-v3.css`.
>
> Kept here because the diagnosis below is the reason any of it exists, and it is still the thing
> to re-read before generating another concept.

This file exists because six independently-generated hero concepts all read as generic, and the
reason was upstream of any of them: nobody had decided what manteen *looks like*. Six agents each
invented a visual language from scratch, so every concept was a layout exercise, and layout
without a visual language reads as a template. This is the missing decision, written down once so
every surface can be checked against it.

## The one sentence

**Source you own, that still knows where it came from.**

That is the whole product and the only claim the home page needs to make. `manteen add` puts real
`.tsx` in your repo that you are expected to edit; `manteen.lock.json` remembers where it came
from; `manteen diff` and `manteen update` keep your edited copy tracking upstream. Mantine stays
an ordinary npm dependency underneath, so the base is not something you are re-deriving.

**What only manteen can show.** The obvious anchor for a registry tool is
`command → file appears → component renders`. That is shadcn's hero, and it reads as generic
because it is — every registry does that part. The picture nobody else's landing page has is the
*second* half: code that landed, that you changed, that upstream also changed, and a tool that
reconciles the two. Lead with stewardship, not installation.

## Voice

A **specimen catalogue** for a working library — not a marketing site. Technical-manual calm.
Confidence comes from craft and density, never from gradients, glow, or motion volume. The reader
is someone who keeps code, not someone being sold to.

## Type — the highest-leverage decision

> **SUPERSEDED.** The diagnosis in the first paragraph held; the call in the second did not. The
> shipped answer is a real pairing, self-hosted: Figtree Variable for display at weight 800, and a
> `wght`-400 Fraunces subset with its optical-size axis live for exactly one accent word. Ari chose
> it from a rendered shortlist. The mono label row below was deleted, not adjusted. See
> `apps/docs/src/styles/fonts.css` (which carries the subsetting recipe and why `opsz` must stay
> live) and `home-v3.css`.

The current page reads templated mostly because it is Starlight's default font stack at default
sizes. Layout cleverness on top of default type still reads as a docs template.

The call: **no new font dependency; instead, two voices from the faces already loaded.**

| Role | Face | Setting |
| --- | --- | --- |
| Display | `--sl-font` (sans, already loaded) | `clamp(2.75rem, 6vw, 4.5rem)`, weight 700, `letter-spacing: -0.03em`, `line-height: 0.98`, measure capped ~16ch |
| **Label / metadata** | `--sl-font-mono` | 0.6875rem, uppercase, `letter-spacing: 0.16em` |
| Body | `--sl-font` | 1.0625rem, `line-height: 1.65`, measure capped 58ch |

Mono is not just for code blocks. It is the voice of **every** eyebrow, kicker, figure number,
file path, command, and metadata row. That single move is what supplies editorial character at
zero asset cost, and it is semantically honest for a tool whose subject is source files.

This is a deliberate call, not a default. If a self-hosted display face is wanted later, it is a
one-variable swap at `--spec-font-display` — the rest of the system does not move.

## Color

Keep the existing page background and indigo accent. The addition is that **the accent system is
diff semantics**, not decoration:

| Token | Dark | Light | Means |
| --- | --- | --- | --- |
| `--spec-add` | `#6ee7a8` | `#0f8a4d` | added by upstream |
| `--spec-mod` | `#f0b866` | `#a35c00` | changed — yours and upstream's both |
| `--spec-rule` | `text @ 12%` | `text @ 14%` | hairline |

Two reasons this is right rather than merely pretty. It gives the page a **warm counterweight** —
everything currently on it is cold blue-grey, which is a large part of why it feels unfinished.
And the colors mean something: they are the colors the CLI itself uses to describe a diff, so the
palette is the product rather than a skin over it.

## Motif

> **SUPERSEDED — all three.** They were the "fifteen devices" the next pass replaced with three
> decisions. The diff gutter survives in one place only, inside `OwnershipPanel`, where it is
> reporting a real reconciliation rather than decorating a rail.

1. **Hairline rule + mono kicker + figure number.** Every section opens with the same three-part
   header (`── 01 / SPECIMEN ──`). Repetition of one device is what makes a page feel authored.
2. **The diff gutter.** A narrow left column carrying `+` and `~` marks. Appears literally on the
   hero's source panel, and again as a decorative rail down the specimen index.
3. **Numbered specimens.** Catalog items are `No. 01` … `No. 22`, not anonymous cards.

## Motion — exactly one idea

The hero panel runs a single slow loop that *performs the product*:

> installed → you edited it → upstream changed too → `manteen diff` marks it → `manteen update`
> reconciles → rest

Concretely: the gutter mark flips, one source line swaps, and **the real component above it
changes with it** — a live `StatCard` gains its `diff` trend row, because `diff?: number` is an
actual optional prop of the actual component. The animation is not a decoration of the pitch; it
*is* the pitch, told with real API surface.

Nothing else on the page moves. `prefers-reduced-motion: reduce` freezes it at the most
informative frame (the reconciled state) rather than removing it.

## Material

- Page is **paper**. Content sits on it directly.
- Code and instrument surfaces are **recessed**: `--manteen-panel`, a hairline border, and a 1px
  inset top highlight.
- **No shadows, no gradients, no glow.** Depth comes only from hairlines and value steps. This is
  the rule most likely to be violated by accident, and violating it is what makes a page look like
  every other dev-tool landing page.

## Manny

The mascot is a mark, not an illustration. Used at small-to-medium scale, once per page, with
space around it — a colophon device or a logo, never a hero-sized character. Charm is load-bearing
here precisely because the rest of the system is so restrained; a big cute render would fight the
specimen voice instead of puncturing it.

Asset: `apps/docs/src/assets/manny-canonical.png` — a transparent-background cutout at 303×320 for a
display box that runs 56–72px on the older concepts and 72px on hero-d. It derives from art that
was pixel-verified against the approved source. It previously lived only in the gitignored
`pencil/` workspace, which made every concept depending on it unbuildable; the same hazard
recurred when it was replaced, since an untracked file builds locally and nowhere else.

All four heroes render it through astro:assets `<Image>`, and `astro.config.mjs` sets
`passthroughImageService()` so that works without Sharp — verified load-bearing, not decorative:
removing it makes `astro build` exit 1. Use one pipeline for it. While hero-d used `<Image>` and
the others used a plain `<img src={manny.src}>`, the same 80 KB emitted twice under two content
hashes.

## How to check a surface against this

- Is every label in mono, uppercase, tracked?
- Is the only saturated color doing diff duty?
- Are there any shadows or gradients? (There should be none.)
- Does the section open with rule + kicker + number?
- Does anything animate other than the one hero loop?
- Does it hold at 390px and in light mode?
