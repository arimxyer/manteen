// Generates the mascot assets the site actually ships.
//
// Source of truth is apps/docs/assets-src/manny/*.png — the full-resolution renders, kept in
// version control because pencil/ (where they were authored) is gitignored, so these are the only
// recoverable copies. They live outside src/ so Astro never bundles them.
//
// Two things happen here, and only the first one is about bytes:
//
//   1. Trim. Every render is 54-73% transparent margin, and the amount differs per asset. That
//      margin is what made placement arithmetic necessary — offsets had to be derived from each
//      asset's margin percentages rather than set directly. Trimming makes the image box equal the
//      character, so `bottom: 0` means "his feet are on the bottom edge".
//   2. Resize + encode. Targets below are 2x the character's largest rendered width, so the assets
//      are correct on HiDPI without the ~14x overshoot of shipping the raw renders.
//
// The output is committed. astro.config.mjs uses passthroughImageService(), which does no
// processing at all — <Image width> is only an HTML attribute there — so whatever is committed is
// exactly what the browser downloads. That service choice is why this script exists rather than
// letting Astro resize; it also means CI needs no ImageMagick, since nothing is generated at build.
//
// Requires ImageMagick 7 (`magick`) with libwebp. Run after changing an asset or a display size:
//   node apps/docs/scripts/build-mascots.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "assets-src/manny");
const OUT = join(root, "src/assets/manny");

// The approved cutouts are pencil/images/manny-approved/finals — thirteen poses, each with a
// transparent background. Its sibling sources/ holds the pre-cutout green-screen renders
// (corners are rgb(10,248,18)); those are upstream art, never site assets. Everything here
// mirrors finals/, so the whole approved set is available rather than only what is placed today.
//
// name -> width in px of the emitted asset = 2x the character's largest rendered CSS width.
// Naming where that width comes from keeps the target and the stylesheet honest about each other.
const TARGETS = {
  "manny-mantine-ambassador": [54, ".brand img 2.5rem"],
  "manny-welcome": [247, ".reconciled img 11.5rem"],
  "manny-working": [327, ".ownershipHeader img 15.625rem"],
  "manny-bringing-source-home": [372, ".installManny 25rem"],
  "manny-editing-owned-source": [437, ".editManny 24rem"],
  "manny-comparing-diffs": [489, ".reconcileManny 24rem"],
  "manny-guardrail": [335, ".ecosystemHeader img 15.625rem"],
  "manny-success": [321, ".closingCta img 15.3125rem"],
  "manny-reyamira-connection": [112, ".footerBrand img 8rem"],

  // Not placed in a layout yet, so there is no CSS rule to derive a width from. 512 covers any
  // size the site currently uses at 2x (the largest placed target is 489). When one of these
  // lands somewhere, replace the width with 2x its rule the way the entries above are — leaving
  // the default is a silent overshoot, not a neutral choice.
  "manny-discovering": [512, "unplaced"],
  "manny-presenting": [512, "unplaced"],
  "manny-reyamira-flag": [512, "unplaced"],
  "manny-thinking": [512, "unplaced"],
};

try {
  execFileSync("magick", ["-version"], { stdio: "ignore" });
} catch {
  console.error("magick (ImageMagick 7) not found — required to regenerate mascots.");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".webp")) rmSync(join(OUT, f));

const missing = Object.keys(TARGETS).filter((n) => !readdirSync(SRC).includes(`${n}.png`));
if (missing.length) {
  console.error(`missing source renders: ${missing.join(", ")}`);
  process.exit(1);
}

let total = 0;
for (const [name, [width, origin]] of Object.entries(TARGETS)) {
  const out = join(OUT, `${name}.webp`);
  execFileSync("magick", [
    join(SRC, `${name}.png`),
    "-background",
    "none",
    "-alpha",
    "set",
    "-trim",
    "+repage",
    "-resize",
    `${width}x`,
    "-quality",
    "88",
    "-define",
    "webp:method=6",
    out,
  ]);
  const [w, h, bytes] = execFileSync("identify", ["-format", "%w %h %B", out])
    .toString()
    .split(" ")
    .map(Number);
  total += bytes;
  console.log(
    `${name.padEnd(30)} ${`${w}x${h}`.padEnd(9)} ${String(Math.round(bytes / 1024)).padStart(4)}K   ${origin}`,
  );
}
console.log(`\n${Object.keys(TARGETS).length} assets, ${Math.round(total / 1024)}K total`);
