/**
 * What version of `@mantine/core` is actually installed — the one gate input
 * that requires reading the filesystem, and the deliberate exception to the
 * no-fs rule the other gate modules are held to.
 *
 * D12: locate the package by walking `node_modules/<name>/package.json` upward
 * from the project root. NEVER `require.resolve("@mantine/core/package.json")`
 * — that package's `exports` map declares only `.`, `./styles.css`,
 * `./styles.layer.css` and `./styles/*`, so the subpath resolve throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`. The upward walk also follows bun/pnpm store
 * symlinks and matches Node's nearest-wins in a monorepo.
 *
 * D11: four outcomes with four distinct messages, and only `found` can refuse.
 * Collapsing the rest into "not installed" is actively wrong under Yarn PnP,
 * where the packages are installed and there is simply no directory to read.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { MantineInstall } from "../plan/types";

const MANTINE_CORE = "@mantine/core";

/** Yarn PnP marker files, in the order Yarn itself has used them. */
const PNP_MARKERS = ["/.pnp.cjs", "/.pnp.js"] as const;

/** Every directory from `start` up to the filesystem root, nearest first. */
function* ancestors(start: string): Generator<string> {
  let current = resolve(start);
  for (;;) {
    yield current;
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/**
 * The installed version of any npm package, or null.
 *
 * Exported because D17's dependency filter needs exactly this for packages the
 * version gate does not gate — a second walk implemented next to it would be a
 * second place for "which node_modules wins" to be answered differently.
 */
export function installedVersion(name: string, root: string): string | null {
  for (const dir of ancestors(root)) {
    const manifest = join(dir, "node_modules", ...name.split("/"), "package.json");
    if (!existsSync(manifest)) continue;
    try {
      const parsed = JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown };
      return typeof parsed.version === "string" ? parsed.version : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveMantineInstall(root: string): MantineInstall {
  // Checked before the walk: under PnP there is no `node_modules` to find, and
  // reporting "not installed" for a project whose packages ARE installed sends
  // the user to fix something that is not broken.
  for (const dir of ancestors(root)) {
    for (const marker of PNP_MARKERS) {
      const path = join(dir, marker.slice(1));
      if (existsSync(path)) return { state: "undeterminable", reason: "pnp", marker: path };
    }
  }

  let sawNodeModules = false;

  for (const dir of ancestors(root)) {
    if (existsSync(join(dir, "node_modules"))) sawNodeModules = true;

    const manifest = join(dir, "node_modules", "@mantine", "core", "package.json");
    if (!existsSync(manifest)) continue;

    let parsed: { version?: unknown };
    try {
      parsed = JSON.parse(readFileSync(manifest, "utf8")) as { version?: unknown };
    } catch {
      return { state: "undeterminable", reason: "unparseable", marker: manifest };
    }
    if (typeof parsed.version !== "string" || parsed.version === "") {
      return { state: "undeterminable", reason: "no-version", marker: manifest };
    }
    return { state: "found", version: parsed.version, from: manifest };
  }

  // The distinction matters to the remedy: with no `node_modules` at all the
  // answer is "install your dependencies", while a populated tree missing
  // `${MANTINE_CORE}` means the plan will install it itself — every catalog item
  // declares it — so refusing would break the greenfield flow.
  return sawNodeModules ? { state: "not-installed" } : { state: "no-node-modules" };
}

/** One sentence describing the install, for a diagnostic or a report line. */
export function describeMantineInstall(install: MantineInstall): string {
  switch (install.state) {
    case "found":
      return `${MANTINE_CORE} ${install.version} (${install.from})`;
    case "not-installed":
      return `${MANTINE_CORE} is not installed`;
    case "no-node-modules":
      return "no node_modules directory was found — dependencies have not been installed";
    case "undeterminable":
      switch (install.reason) {
        case "pnp":
          return `Yarn Plug'n'Play is in use (${install.marker ?? ".pnp.cjs"}), so the installed ${MANTINE_CORE} version cannot be read from disk`;
        case "no-version":
          return `${install.marker ?? "the manifest"} declares no version`;
        case "unparseable":
          return `${install.marker ?? "the manifest"} is not valid JSON`;
      }
  }
}
