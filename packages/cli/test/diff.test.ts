/**
 * `manteen diff` — the eight-state classifier, the patch direction, and the
 * property the whole command rests on: it writes NOTHING.
 *
 * The write test is a HASH MANIFEST over the entire fixture tree, taken before
 * and after a full `reportDiff`, and it compares the file SET as well as the
 * contents — a command that only ever created files would pass a
 * contents-only check. Scope, stated precisely: this proves `commands/diff.ts`
 * writes nothing. `plan()` not writing is a separate invariant, documented at
 * `plan/index.ts`, and it is stubbed out here.
 *
 * `plan` arrives as a port, so the suite needs no network and no registry. The
 * stub is honest about the three fields `diff` actually reads off a
 * `PlannedFile` — `destination`, `sha256` and `content` — and plausible about
 * the rest.
 *
 * `readReceipt` is the REAL implementation against a real temp project. Faking
 * it would test the fake: its structural pass is what proves `fromReceiptPath`
 * cannot escape the root, and it is the only reason `fromReceiptState` takes a
 * `ReceiptState` rather than a `Receipt`.
 *
 * `LoadedConfig` is built by hand rather than through `loadConfig`, for a
 * mechanical reason: `config/load.ts` resolves its schema as
 * `resolve(import.meta.dirname, "../schema/…")`, which is correct for the FLAT
 * dist and misses from `src/config/`. That is the e2e tier's job, and nothing
 * is lost here — `diff` reads exactly two fields off a config (`root` and
 * `registries`) and hands the object to `plan()`, which is stubbed.
 */

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildDiff,
  createFileSnapshot,
  type DiffPorts,
  renderDiff,
  renderDiffJson,
  reportDiff,
} from "../src/commands/diff";
import type { AliasBacking, AliasKey, LoadedConfig } from "../src/config/types";
import type { DiffFile, DiffResult, FileChange } from "../src/inventory/types";
import type {
  Diagnostic,
  Plan,
  PlanItem,
  PlannedFile,
  PlannedTheme,
  Receipt,
} from "../src/plan/types";
import { createReceiptReader, createReceiptValidator } from "../src/receipt/load";
import { readReceipt } from "../src/receipt/read";

const TSCONFIG = {
  compilerOptions: {
    baseUrl: ".",
    paths: {
      "@/components/ui/*": ["./src/components/ui/*"],
      "@/components/*": ["./src/components/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/lib/*": ["./src/lib/*"],
    },
  },
};

const ALIASES: Record<AliasKey, string> = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};

/** The namespaces `manteen.json` configures. `@stranger` is deliberately not
 *  one of them: the receipt records an item from it, which is the
 *  `unknown-namespace` case. */
const CONFIGURED = ["@house", "@other"];

const projects: string[] = [];

afterAll(() => {
  for (const project of projects) rmSync(project, { recursive: true, force: true });
});

/** The receipt's hash domain: the UTF-8 encoding of the STRING manteen wrote. */
function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function write(root: string, relativePath: string, content: string): void {
  const absolute = resolve(root, ...relativePath.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/**
 * Every file under `root`, as path -> sha256 of its RAW BYTES.
 *
 * Keyed POSIX and root-relative so the assertion diff is readable, and taken
 * over the whole tree rather than over the destinations `diff` was told about —
 * a command that wrote a stray `.manteen-cache` beside them would otherwise
 * pass.
 */
function manifest(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else {
        out[relative(root, absolute).split(sep).join("/")] = createHash("sha256")
          .update(readFileSync(absolute))
          .digest("hex");
      }
    }
  };
  walk(root);
  return out;
}

// ---- the fixture ---------------------------------------------------------------
// One project exercising all eight `FileChange` states at once, because the
// classifier's ordering (`unavailable` before `added-upstream`,
// `removed-upstream` before `missing`) is only observable when the states are
// present together.

const UNCHANGED = "export const Unchanged = 1;\n";
const RECORDED_LOCAL = "export const Local = 1;\n";
const EDITED_LOCAL = "export const Local = 2; // hand-edited\n";
const RECORDED_UPSTREAM = "export const Upstream = 1;\n";
const SERVED_UPSTREAM = "export const Upstream = 2;\n";
const RECORDED_BOTH = "export const Both = 1;\n";
const EDITED_BOTH = "export const Both = 2; // hand-edited\n";
const SERVED_BOTH = "export const Both = 3;\n";
const GONE = "export const Gone = 1;\n";
const DROPPED = "export const Dropped = 1;\n";
const OFFLINE = "export const Offline = 1;\n";
const ADDED = "export const Added = 1;\n";
const STRANGER = "export const Stranger = 1;\n";

const THEME_RECORDED = 'import { createTheme } from "@mantine/core";\nexport const theme = 1;\n';
const THEME_EDITED = 'import { createTheme } from "@mantine/core";\nexport const theme = 2;\n';
const THEME_FOLDED = 'import { createTheme } from "@mantine/core";\nexport const theme = 3;\n';

const UI = "src/components/ui";

interface FixtureOptions {
  /** Omit `manteen.lock.json` entirely — the "manteen has never run here" case. */
  noReceipt?: boolean;
}

function makeProject(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-diff-"));
  projects.push(root);

  // Written even though `LoadedConfig` is built by hand: the no-write manifest
  // is taken over the WHOLE tree, and a project's own files are exactly what a
  // read-only command must leave alone.
  write(root, "package.json", `${JSON.stringify({ name: "c", private: true }, null, 2)}\n`);
  write(root, "tsconfig.json", `${JSON.stringify(TSCONFIG, null, 2)}\n`);
  write(
    root,
    "manteen.json",
    `${JSON.stringify(
      { registries: registryTemplates(root), aliases: ALIASES, theme: "src/lib/theme.ts" },
      null,
      2,
    )}\n`,
  );

  // On disk. `gone.tsx` is deliberately absent.
  write(root, `${UI}/unchanged.tsx`, UNCHANGED);
  write(root, `${UI}/local.tsx`, EDITED_LOCAL);
  write(root, `${UI}/upstream.tsx`, RECORDED_UPSTREAM);
  write(root, `${UI}/both.tsx`, EDITED_BOTH);
  write(root, `${UI}/dropped.tsx`, DROPPED);
  write(root, `${UI}/offline.tsx`, OFFLINE);
  write(root, `${UI}/stranger.tsx`, STRANGER);
  write(root, "src/lib/theme.ts", THEME_EDITED);

  if (options.noReceipt === true) return root;

  const receipt: Receipt = {
    lockfileVersion: 2,
    items: [
      {
        id: "@house/offline",
        registry: "@house",
        sourceUrl: "file:///house/offline.json",
        wireType: "registry:ui",
        direct: true,
        files: [
          { destination: `${UI}/offline.tsx`, wireType: "registry:ui", sha256: sha(OFFLINE) },
        ],
      },
      {
        id: "@house/widget",
        registry: "@house",
        sourceUrl: "file:///house/widget.json",
        wireType: "registry:ui",
        direct: true,
        files: [
          { destination: `${UI}/both.tsx`, wireType: "registry:ui", sha256: sha(RECORDED_BOTH) },
          { destination: `${UI}/dropped.tsx`, wireType: "registry:ui", sha256: sha(DROPPED) },
          { destination: `${UI}/gone.tsx`, wireType: "registry:ui", sha256: sha(GONE) },
          { destination: `${UI}/local.tsx`, wireType: "registry:ui", sha256: sha(RECORDED_LOCAL) },
          {
            destination: `${UI}/unchanged.tsx`,
            wireType: "registry:ui",
            sha256: sha(UNCHANGED),
          },
          {
            destination: `${UI}/upstream.tsx`,
            wireType: "registry:ui",
            sha256: sha(RECORDED_UPSTREAM),
          },
        ],
      },
      {
        id: "@stranger/thing",
        registry: "@stranger",
        sourceUrl: "file:///stranger/thing.json",
        wireType: "registry:ui",
        direct: true,
        files: [
          { destination: `${UI}/stranger.tsx`, wireType: "registry:ui", sha256: sha(STRANGER) },
        ],
      },
    ],
    theme: {
      destination: "src/lib/theme.ts",
      sha256: sha(THEME_RECORDED),
      sources: [{ itemId: "@house/widget", kind: "meta-fragment", path: "theme.ts" }],
    },
    styles: null,
  };

  write(root, "manteen.lock.json", `${JSON.stringify(receipt, null, 2)}\n`);
  return root;
}

function registryTemplates(root: string): Record<string, string> {
  return Object.fromEntries(
    CONFIGURED.map((namespace) => [
      namespace,
      `${pathToFileURL(join(root, namespace.slice(1))).href}/{name}.json`,
    ]),
  );
}

/**
 * A `LoadedConfig` as `loadConfig` would have produced it.
 *
 * `target` throws rather than returning something plausible: `plan()` is the
 * only caller of it, `plan()` is stubbed here, and a resolver that quietly
 * answers would hide the day that stops being true.
 */
function config(root: string): LoadedConfig {
  const templates = registryTemplates(root);
  const aliasBacking = Object.fromEntries(
    (Object.keys(ALIASES) as AliasKey[]).map((key): [AliasKey, AliasBacking] => [
      key,
      { key: `${ALIASES[key]}/*`, sample: resolve(root, "src", key, "example.tsx") },
    ]),
  ) as Record<AliasKey, AliasBacking>;

  return {
    configPath: join(root, "manteen.json"),
    root,
    raw: { registries: templates, aliases: ALIASES, theme: "src/lib/theme.ts" },
    registries: new Map(
      CONFIGURED.map((namespace) => [
        namespace,
        {
          namespace,
          url: templates[namespace] as string,
          index: null,
          headers: {},
          params: {},
        },
      ]),
    ),
    aliases: ALIASES,
    aliasBacking,
    themeDestination: resolve(root, "src", "lib", "theme.ts"),
    stylesDestination: null,
    tsconfigPath: join(root, "tsconfig.json"),
    tsconfig: { path: join(root, "tsconfig.json"), config: TSCONFIG } as LoadedConfig["tsconfig"],
    resolutions: new Map(),
    target: () => {
      throw new Error("config.target is unreachable: plan() is stubbed in this suite");
    },
  };
}

// ---- the plan stub ---------------------------------------------------------------

/**
 * `diff` reads exactly three fields off a `PlannedFile` — `destination`,
 * `sha256` and `content`. The other four are filled in plausibly so the stub
 * cannot be mistaken for a claim that they are unused by anything else.
 */
function plannedFile(itemId: string, root: string, relativePath: string, content: string) {
  return {
    itemId,
    sourcePath: relativePath.split("/").at(-1) ?? relativePath,
    wireType: "registry:ui",
    destination: resolve(root, ...relativePath.split("/")),
    content,
    sha256: sha(content),
    existing: null,
    disposition: "create",
    priorOwner: null,
  } satisfies PlannedFile;
}

interface StubOptions {
  /** Items the "registry" serves this run. An installed item left out of this
   *  list is the `unavailable` case. */
  items?: PlanItem[];
  theme?: PlannedTheme | null;
  diagnostics?: Diagnostic[];
  /** Records what `reportDiff` asked for. */
  seen?: { refs: string[][] };
}

function stubPlan(options: StubOptions = {}): DiffPorts["plan"] {
  return async (loaded, refs) => {
    options.seen?.refs.push([...refs]);
    const items = options.items ?? [];
    // The REAL read, because `fromReceiptState` requires the `ok: true` arm as
    // proof the structural pass ran.
    const receipt = readReceipt(loaded.root, createReceiptReader(), createReceiptValidator());
    return {
      version: 1,
      root: loaded.root,
      configPath: loaded.configPath,
      items,
      files: items.flatMap((item) => item.files),
      dependencies: [],
      packageManager: "npm",
      installCommand: null,
      theme: options.theme ?? null,
      styles: null,
      mantine: { state: "not-installed" },
      receipt,
      diagnostics: options.diagnostics ?? [],
      ok: true,
    } satisfies Plan;
  };
}

/** The `@house/widget` the registry serves today. */
function widget(root: string): PlanItem {
  return {
    id: "@house/widget",
    namespace: "@house",
    name: "widget",
    wireType: "registry:ui",
    sourceUrl: "file:///house/widget.json",
    requestedBy: ["<root>"],
    dependsOn: [],
    cssImports: [],
    files: [
      plannedFile("@house/widget", root, `${UI}/unchanged.tsx`, UNCHANGED),
      plannedFile("@house/widget", root, `${UI}/local.tsx`, RECORDED_LOCAL),
      plannedFile("@house/widget", root, `${UI}/upstream.tsx`, SERVED_UPSTREAM),
      plannedFile("@house/widget", root, `${UI}/both.tsx`, SERVED_BOTH),
      plannedFile("@house/widget", root, `${UI}/gone.tsx`, GONE),
      // `dropped.tsx` is deliberately absent: removed-upstream.
      plannedFile("@house/widget", root, "src/lib/added.ts", ADDED),
    ],
  };
}

function themePlan(root: string, changed: boolean): PlannedTheme {
  const text = changed ? THEME_FOLDED : THEME_EDITED;
  return {
    destination: resolve(root, "src", "lib", "theme.ts"),
    base: { sha256: sha(THEME_EDITED) },
    text,
    sha256: sha(text),
    changed,
    added: [],
    importsAdded: [],
    conflicts: [],
    sources: [{ itemId: "@house/widget", kind: "meta-fragment", path: "theme.ts" }],
  };
}

// ---- the harness -----------------------------------------------------------------

interface Run {
  code: number;
  out: string;
  err: string;
}

async function run(
  root: string,
  refs: string[],
  stub: StubOptions,
  flags: { json?: boolean; stat?: boolean } = {},
): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const ports: DiffPorts = {
    plan: stubPlan(stub),
    readReceiptState: (r) => readReceipt(r, createReceiptReader(), createReceiptValidator()),
    // A fresh snapshot per run: it caches, and a shared one across two runs
    // would serve the first run's bytes to the second.
    snapshot: createFileSnapshot(),
    renderDiagnostic: (diagnostic) => `error  ${diagnostic.code}\n`,
    stdout: (chunk) => out.push(chunk),
    stderr: (chunk) => err.push(chunk),
  };
  const code = await reportDiff(config(root), { refs, ...flags }, ports);
  return { code, out: out.join(""), err: err.join("") };
}

/** The parsed `DiffResult`, via the `--json` renderer. */
async function result(root: string, refs: string[], stub: StubOptions): Promise<DiffResult> {
  const { out } = await run(root, refs, stub, { json: true });
  return JSON.parse(out) as DiffResult;
}

function changeOf(result: DiffResult, id: string, receiptPath: string): FileChange | "absent" {
  const item = result.items.find((candidate) => candidate.id === id);
  return item?.files.find((file) => file.receiptPath === receiptPath)?.change ?? "absent";
}

function fileOf(result: DiffResult, id: string, receiptPath: string): DiffFile {
  const item = result.items.find((candidate) => candidate.id === id);
  const file = item?.files.find((candidate) => candidate.receiptPath === receiptPath);
  if (file === undefined) throw new Error(`no row for ${id} ${receiptPath}`);
  return file;
}

// ---- tests ---------------------------------------------------------------------

describe("the eight states", () => {
  let root: string;
  let diff: DiffResult;

  beforeEach(async () => {
    root = makeProject();
    diff = await result(root, [], { items: [widget(root)], theme: themePlan(root, true) });
  });

  test("disk === recorded === upstream is unchanged", () => {
    expect(changeOf(diff, "@house/widget", `${UI}/unchanged.tsx`)).toBe("unchanged");
  });

  test("an edited file whose upstream never moved is local-only", () => {
    expect(changeOf(diff, "@house/widget", `${UI}/local.tsx`)).toBe("local-only");
  });

  test("an untouched file the registry changed is upstream-only", () => {
    expect(changeOf(diff, "@house/widget", `${UI}/upstream.tsx`)).toBe("upstream-only");
  });

  test("both sides moved is `both` — the case that most needs showing", () => {
    expect(changeOf(diff, "@house/widget", `${UI}/both.tsx`)).toBe("both");
  });

  test("a recorded file deleted from disk is missing", () => {
    expect(changeOf(diff, "@house/widget", `${UI}/gone.tsx`)).toBe("missing");
  });

  test("a recorded file the item no longer ships is removed-upstream", () => {
    expect(changeOf(diff, "@house/widget", `${UI}/dropped.tsx`)).toBe("removed-upstream");
  });

  test("a shipped file with no receipt record is added-upstream", () => {
    expect(changeOf(diff, "@house/widget", "src/lib/added.ts")).toBe("added-upstream");
  });

  test("an item that never reached the graph is unavailable, not removed-upstream", () => {
    // The distinction the classifier's ordering exists for: "the registry
    // stopped shipping this" and "we could not ask" are different answers.
    expect(changeOf(diff, "@house/offline", `${UI}/offline.tsx`)).toBe("unavailable");
  });

  test("hashes are reported in all three columns", () => {
    const file = fileOf(diff, "@house/widget", `${UI}/both.tsx`);
    expect(file.recordedSha256).toBe(sha(RECORDED_BOTH));
    expect(file.currentSha256).toBe(sha(EDITED_BOTH));
    expect(file.upstreamSha256).toBe(sha(SERVED_BOTH));
  });

  test("a missing file has a null currentSha256, never a hash of nothing", () => {
    expect(fileOf(diff, "@house/widget", `${UI}/gone.tsx`).currentSha256).toBeNull();
  });

  test("removed-upstream and unavailable carry no upstream hash", () => {
    expect(fileOf(diff, "@house/widget", `${UI}/dropped.tsx`).upstreamSha256).toBeNull();
    expect(fileOf(diff, "@house/offline", `${UI}/offline.tsx`).upstreamSha256).toBeNull();
  });

  test("items and files are sorted by code unit", () => {
    expect(diff.items.map((item) => item.id)).toEqual([
      "@house/offline",
      "@house/widget",
      "@stranger/thing",
    ]);
    const widgetFiles = diff.items[1]?.files.map((file) => file.receiptPath) ?? [];
    expect(widgetFiles).toEqual([...widgetFiles].sort());
  });
});

describe("the patch", () => {
  test("runs on disk -> upstream, so a local-only edit renders as a revert", async () => {
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)] });
    const patch = fileOf(diff, "@house/widget", `${UI}/local.tsx`).patch ?? "";

    // The direction is load-bearing: only two of the three sides have content,
    // so the patch can only ever be disk -> upstream. Reversing it would be a
    // "fix" that makes every other state's patch wrong.
    expect(patch).toContain(`-${EDITED_LOCAL.trimEnd()}`);
    expect(patch).toContain(`+${RECORDED_LOCAL.trimEnd()}`);
    expect(patch).toContain("--- ");
    // jsdiff's RCS `Index:` preamble is not part of a unified diff.
    expect(patch.startsWith("Index:")).toBe(false);
  });

  test("an unchanged file gets no patch", async () => {
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)] });
    expect(fileOf(diff, "@house/widget", `${UI}/unchanged.tsx`).patch).toBeNull();
  });

  test("states with no upstream content get no patch", async () => {
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)] });
    expect(fileOf(diff, "@house/widget", `${UI}/dropped.tsx`).patch).toBeNull();
    expect(fileOf(diff, "@house/offline", `${UI}/offline.tsx`).patch).toBeNull();
  });

  test("a missing file patches from empty, so update reads as a restore", async () => {
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)] });
    expect(fileOf(diff, "@house/widget", `${UI}/gone.tsx`).patch).toContain(`+${GONE.trimEnd()}`);
  });

  test("--stat computes no patch at all", async () => {
    const root = makeProject();
    const { out } = await run(
      root,
      [],
      { items: [widget(root)], theme: themePlan(root, true) },
      { json: true, stat: true },
    );
    const diff = JSON.parse(out) as DiffResult;
    for (const item of diff.items) {
      for (const file of item.files) expect(file.patch).toBeNull();
    }
    expect(diff.theme?.patch).toBeNull();
    // The classification is unaffected — only the rendering is.
    expect(changeOf(diff, "@house/widget", `${UI}/both.tsx`)).toBe("both");
  });
});

describe("the theme", () => {
  test("a hand-edited theme the fold would not rewrite is local-only, not both", async () => {
    // The trap this exists for: the fold's BASE is the current on-disk file, so
    // `plan.theme.sha256` already carries the user's edit. A naive three-way
    // hash comparison reports `both` here, which is wrong.
    const root = makeProject();
    const diff = await result(root, [], {
      items: [widget(root)],
      theme: themePlan(root, false),
    });
    expect(diff.theme?.change).toBe("local-only");
  });

  test("a fold that would rewrite an edited theme is both", async () => {
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)], theme: themePlan(root, true) });
    expect(diff.theme?.change).toBe("both");
    expect(diff.theme?.upstreamSha256).toBe(sha(THEME_FOLDED));
    expect(diff.theme?.patch).toContain(`+${THEME_FOLDED.trimEnd().split("\n").at(-1)}`);
  });

  test("no plan theme means upstream is unknown, not unchanged", async () => {
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)], theme: null });
    expect(diff.theme?.change).toBe("unavailable");
    expect(diff.theme?.upstreamSha256).toBeNull();
  });

  test("a receipt with no theme reports no theme, even when the plan folds one", async () => {
    const root = makeProject({ noReceipt: true });
    const diff = await result(root, [], { items: [], theme: themePlan(root, true) });
    expect(diff.theme).toBeNull();
  });
});

describe("selection", () => {
  test("no refs compares every installed item", async () => {
    const root = makeProject();
    const seen = { refs: [] as string[][] };
    await result(root, [], { items: [widget(root)], seen });
    expect(seen.refs[0]).toEqual(["@house/offline", "@house/widget"]);
  });

  test("an item whose namespace is no longer configured is never fetched", async () => {
    // `@stranger` is in the receipt and not in manteen.json, so its upstream is
    // unknowable — but its recorded files are still worth reporting.
    const root = makeProject();
    const diff = await result(root, [], { items: [widget(root)] });
    expect(changeOf(diff, "@stranger/thing", `${UI}/stranger.tsx`)).toBe("unavailable");
    expect(diff.notes.map((note) => note.code)).toContain("unknown-namespace");
  });

  test("a named ref narrows the report", async () => {
    const root = makeProject();
    const seen = { refs: [] as string[][] };
    const diff = await result(root, ["@house/widget"], { items: [widget(root)], seen });
    expect(seen.refs[0]).toEqual(["@house/widget"]);
    expect(diff.items.map((item) => item.id)).toEqual(["@house/widget"]);
  });

  test("a repeated ref is a typo, not a request for two reports", async () => {
    const root = makeProject();
    const seen = { refs: [] as string[][] };
    await result(root, ["@house/widget", "@house/widget"], { items: [widget(root)], seen });
    expect(seen.refs[0]).toEqual(["@house/widget"]);
  });

  test("an uninstalled ref is a note, not a fetch — never added-upstream", async () => {
    const root = makeProject();
    const seen = { refs: [] as string[][] };
    const diff = await result(root, ["@house/nope"], { items: [], seen });
    expect(seen.refs[0]).toEqual([]);
    expect(diff.items).toEqual([]);
    expect(diff.notes.map((note) => note.code)).toEqual(["not-installed"]);
  });

  test("a selection that matched nothing does not print No changes", async () => {
    // The trap: the explanation is a note, notes go to stderr, and a pipeline
    // routinely discards stderr — so stdout saying "No changes." would tell a
    // user their uninstalled item is up to date.
    const root = makeProject();
    const { code, out, err } = await run(root, ["@house/nope"], { items: [] });
    expect(code).toBe(0);
    expect(out).not.toContain("No changes.");
    expect(out).toContain("Nothing to compare");
    expect(err).toContain("not-installed");
  });

  test("a selection that matched nothing does not report the theme either", async () => {
    // The theme is folded, not owned (D5), so it belongs to no item — but a
    // selection that matched nothing asked about nothing, and reporting the
    // theme as `unavailable` would claim we tried to read its upstream.
    const root = makeProject();
    const diff = await result(root, ["@house/nope"], { items: [] });
    expect(diff.theme).toBeNull();
  });

  test("a scoped run that DID match still reports the theme", async () => {
    const root = makeProject();
    const diff = await result(root, ["@house/widget"], {
      items: [widget(root)],
      theme: themePlan(root, true),
    });
    expect(diff.theme?.change).toBe("both");
  });

  test("an unqualified name is refused rather than guessed at", async () => {
    const root = makeProject();
    const diff = await result(root, ["widget"], { items: [] });
    expect(diff.notes[0]?.code).toBe("not-installed");
    expect(diff.notes[0]?.message).toContain("@house/data-table");
  });
});

describe("an absent receipt", () => {
  test("exits 0 with the no-receipt note and an empty report", async () => {
    const root = makeProject({ noReceipt: true });
    const { code, out, err } = await run(root, [], { items: [] });
    expect(code).toBe(0);
    expect(err).toContain("no-receipt");
    // Not "No changes." — manteen has never run here, which is a different
    // answer with a different next step.
    expect(out).toContain("Nothing to compare");
  });

  test("the JSON form is still a complete DiffResult", async () => {
    const root = makeProject({ noReceipt: true });
    const diff = await result(root, [], { items: [] });
    expect(diff.items).toEqual([]);
    expect(diff.theme).toBeNull();
    expect(diff.notes.map((note) => note.code)).toEqual(["no-receipt"]);
  });

  test("a corrupt receipt reports nothing rather than reporting from it", async () => {
    // `buildIndex` and `fromReceiptState` agree: nothing in this codebase reads
    // records out of a receipt it could not fully validate. A `diff` that half-
    // read a broken lockfile would report drift that is an artifact of the
    // damage.
    const root = makeProject();
    write(root, "manteen.lock.json", '{"lockfileVersion": 1, "items": [ oops\n');
    const { code, out, err } = await run(root, [], { items: [] });
    expect(code).toBe(0);
    expect(err).toContain("receipt-unreadable");
    expect(out).toContain("Nothing to compare");
  });
});

describe("it writes nothing", () => {
  test("the whole tree is byte-identical before and after a full run", async () => {
    const root = makeProject();
    const before = manifest(root);

    const { code } = await run(root, [], {
      items: [widget(root)],
      theme: themePlan(root, true),
    });

    expect(code).toBe(0);
    const after = manifest(root);
    // The KEY SET as well as the hashes: a command that only created files
    // would pass a contents-only comparison.
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect(after).toEqual(before);
  });

  test("the JSON path writes nothing either", async () => {
    const root = makeProject();
    const before = manifest(root);
    await run(root, [], { items: [widget(root)], theme: themePlan(root, true) }, { json: true });
    expect(manifest(root)).toEqual(before);
  });
});

describe("rendering", () => {
  test("unchanged rows are counted, not listed", async () => {
    const root = makeProject();
    const { out } = await run(root, [], { items: [widget(root)], theme: themePlan(root, true) });
    expect(out).not.toContain("unchanged.tsx");
    expect(out).toContain("unchanged.");
    expect(out).toContain("both              ");
  });

  test("the report is stable across runs", async () => {
    const root = makeProject();
    const stub = { items: [widget(root)], theme: themePlan(root, true) };
    const first = await run(root, [], stub);
    const second = await run(root, [], stub);
    expect(second.out).toBe(first.out);
    expect(second.err).toBe(first.err);
  });

  test("plan diagnostics go to stderr, the report to stdout", async () => {
    const root = makeProject();
    const diagnostic: Diagnostic = {
      code: "fetch-failed",
      severity: "error",
      message: "@house/offline could not be reached.",
      items: ["@house/offline"],
      forceable: false,
    };
    const { out, err } = await run(root, [], { items: [widget(root)], diagnostics: [diagnostic] });
    expect(err).toContain("fetch-failed");
    expect(out).not.toContain("fetch-failed");
  });

  test("info diagnostics are dropped — a report is not a place for styles-api", async () => {
    const root = makeProject();
    const noisy: Diagnostic = {
      code: "styles-api",
      severity: "info",
      message: "@house/widget exposes Styles API selectors.",
      items: ["@house/widget"],
      forceable: false,
    };
    const { err } = await run(root, [], { items: [widget(root)], diagnostics: [noisy] });
    expect(err).not.toContain("styles-api");
    // The rows are unaffected: the filter is on presentation, never on the report.
    expect(err).toContain("unknown-namespace");
  });

  test("nothing anywhere says No changes when something changed", async () => {
    const root = makeProject();
    const { out } = await run(root, [], { items: [widget(root)] });
    expect(out).not.toContain("No changes.");
    expect(out).toMatch(/\d+ changes, \d+ unchanged\.\n$/);
  });
});

describe("buildDiff is pure with respect to the receipt", () => {
  test("the report is built from plan.receipt, never from a second read", async () => {
    // `installed.ts` states the rule: a command holding a Plan must use
    // `fromReceiptState(plan.receipt, …)`. The proof is that a plan carrying an
    // ABSENT receipt yields an empty report even though the file exists on disk.
    const root = makeProject();
    const snapshot = createFileSnapshot();
    const built = buildDiff({
      plan: {
        version: 1,
        root,
        configPath: join(root, "manteen.json"),
        items: [],
        files: [],
        dependencies: [],
        packageManager: "npm",
        installCommand: null,
        theme: null,
        styles: null,
        mantine: { state: "not-installed" },
        receipt: { present: false, path: join(root, "manteen.lock.json") },
        diagnostics: [],
        ok: true,
      },
      scope: null,
      snapshot,
      patches: true,
      notes: [],
    });

    expect(built.items).toEqual([]);
    expect(built.notes.map((note) => note.code)).toEqual(["no-receipt"]);
    expect(renderDiff(built)).toBe("Nothing to compare — see the 1 note above.\n");
    expect(JSON.parse(renderDiffJson(built)).root).toBe(root);
  });
});
