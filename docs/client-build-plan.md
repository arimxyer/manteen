> **Naming note.** This plan was produced before the project was renamed to *manteen*.
> Read it with this mapping; nothing else about it changed.
>
> | In the plan | Actual |
> |---|---|
> | `mantine-cli`, `mantine <cmd>` | `manteen`, `manteen <cmd>` |
> | `mantine-registry-kit` | `manteen-kit` |
> | `mantine.json` / `mantine.schema.json` | `manteen.json` / `manteen.schema.json` |
> | `mantine-registry.json` | `manteen.registry.json` |
>
> References to `@mantine/core`, `meta.mantine`, and diagnostic codes such as
> `mantine-version-mismatch` are unaffected — those name Mantine itself.

# mantine-cli — Build Plan and Decision Record

> **Status guide.** §1's refusal table remains the live, guard-enforced diagnostic contract.
> The surrounding package/type sketches and the phase/slice narrative preserve the plan that built
> the original client; they are historical implementation records, not a description of every
> current type. Decisions are cumulative: later numbered rows override earlier text where they
> disagree, and D32–D40 plus [`update-merge-handoff.md`](update-merge-handoff.md) and
> [`update-verification-handoff.md`](update-verification-handoff.md) are the current receipt-v3,
> update, and post-update verification contract. Sections 5 and 6 preserve closed questions and
> original deferrals; their headings and row labels state which work subsequently shipped.

## 1. Shape

### Package skeleton

```
packages/cli/
  package.json                      bin.mantine -> ./dist/cli.mjs; type module; engines.node >=22.12
  tsdown.config.mjs                 entry { index: src/index.ts, cli: src/cli/index.ts }, FLAT dist
  README.md
  schema/mantine.schema.json        consumer config schema; $schema = http://json-schema.org/draft-07/schema#
  schema/mantine-item-meta.schema.json   meta.mantine (wire schema leaves `meta` open)
  src/index.ts                      programmatic surface: plan, apply, loadConfig, types
  src/cli/index.ts                  commander 15 program; bin entry
  src/ui.ts                         clack facade; the single interactivity predicate
  src/config/
    types.ts  validate.ts  env.ts  registries.ts  aliases.ts  load.ts  index.ts
  src/plan/
    types.ts        the Plan contract + every port interface (sole declaration site)
    ref.ts          parseRef, canonicalId
    registry-source.ts   toRequest(ref, config, env) -> ItemRequest (env is a parameter)
    loader-local.ts createFileLoader, createMemoryLoader
    loader-http.ts  createHttpLoader (the only module that calls fetch)
    validate-item.ts  kit wire validator + meta.mantine validator
    graph.ts        findCycles (Tarjan), topoSort (Kahn, lexicographic tiebreak)
    deps.ts         parseNpmSpec, unionDependencies
    theme-fold.ts   foldTheme(base, fragments) -> PlannedTheme
    diagnostics.ts  diag(), DIAGNOSTIC_CODES, isBlocking, sortDiagnostics
    resolve.ts      resolve(ports, config, refs) -> ResolvedGraph   (no fs, no fetch)
    index.ts        plan() — wires concrete ports, runs gates, folds theme
  src/gates/
    index.ts  mantine-version.ts  resolve-mantine-install.ts  provider.ts
    collision.ts  styles-api.ts  report.ts
  src/apply/
    index.ts  preflight.ts  decide.ts  journal.ts  write-files.ts
    write-theme.ts  install-deps.ts  report.ts
  src/fs/walk.ts                    bounded walker, injected into provider.ts
  fixtures/collide/                 @collide registry — OUTSIDE test/, so the root tsconfig
                                    `include` (packages/*/test/**/*) does not typecheck it
  test/                             bun:test tier
  e2e/*.node-e2e.mjs                node:test tier, runs real `node` against dist/
  scripts/guard-runtime-apis.mjs    static guard over src/** and test/**
```

`manteen-kit@^0.1.0` is a runtime dependency and must stay **external**. Bun links the matching
workspace package during development, while the packed manifest retains that publishable range.
The kit's `createWireValidator` resolves schemas via `resolve(import.meta.dirname, "..")` = the
*kit's* package root (build-registry.ts:27). Bundling it repoints that at `packages/cli/` and throws
ENOENT at runtime only.

### Purity convention — stated once, binds every module

This kills four separate "module labeled pure but does I/O" findings across the dimension critiques.

- **`plan()` may READ disk and the network; it never writes.** Reading `node_modules/@mantine/core/package.json`, hashing existing destinations, and reading the base theme are all legal inside `plan()`.
- **Ambient state enters through parameters only.** `process.env`, `fetch`, `fs`, and the clock are never touched by a module labeled pure. `registry-source.ts` takes `env: Record<string, string | undefined>`; `provider.ts` takes an injected walker; `aliases.ts` takes an injected `exists: (p: string) => boolean`.
- **Exactly four impure modules:** `config/load.ts`, `plan/loader-http.ts`, `plan/loader-local.ts`, `plan/index.ts` (composition), plus everything under `src/apply/` and `src/fs/`. `apply/preflight.ts` and `apply/decide.ts` are **read-only impure** — they hash and compare files — not pure.
- A lint rule bans `node:fs` and `fetch` imports in `src/plan/resolve.ts`, `src/plan/graph.ts`, `src/plan/deps.ts`, `src/plan/theme-fold.ts`, `src/gates/*.ts` (except `resolve-mantine-install.ts`).

### The plan/apply contract

```ts
// src/plan/types.ts — sole declaration site for every cross-stage type.

export type CanonicalId = string;            // "@house/data-table" | "url:https://x/r/a.json"
export type Severity = "error" | "warn" | "info";

export type DiagnosticCode =
  | "unknown-namespace" | "missing-env" | "fetch-failed" | "wire-invalid"
  | "file-no-content"   | "meta-invalid-requires" | "meta-degraded"
  | "target-collision"  | "target-escapes-root"   | "target-refused-type"
  | "resolution-applied"| "dependency-cycle"      | "bare-dep-assumed-local"
  | "bare-dep-unresolvable" | "name-mismatch"
  | "dependency-range-conflict" | "dependency-range-narrowed"
  | "mantine-version-mismatch"  | "mantine-version-unknown" | "mantine-malformed-metadata"
  | "provider-missing"  | "styles-api"
  | "theme-base-unmergeable" | "theme-conflict"
  | "destination-exists" | "no-package-manager"
  | "depth-exceeded" | "node-limit" | "response-too-large";

export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;                 // rendered text; never contains an expanded secret
  items?: CanonicalId[];           // who this is about
  path?: string;                   // destination or config path, when relevant
  forceable: boolean;              // whether --force may downgrade error -> warn
}

// ---- ports -----------------------------------------------------------------
export interface ItemRequest {
  id: CanonicalId;
  url: string;                     // expanded — never stored on the Plan
  redactedUrl: string;             // ${VAR} left literal — this is what the Plan stores
  headers: Record<string, string>; // expanded — never stored on the Plan
}
export type LoadedDoc =
  | { ok: true;  doc: unknown; redactedUrl: string }
  | { ok: false; reason: "network" | "status" | "not-json" | "too-large";
      status?: number; redactedUrl: string; detail?: string };

export type ItemLoader   = (req: ItemRequest) => Promise<LoadedDoc>;
export type TargetResolver = (
  file: { path: string; type: string; target?: string },
  item: { id: CanonicalId; namespace: string | null },
) => { destination: string } | { refused: DiagnosticCode; detail: string };

export interface ResolvePorts {
  load: ItemLoader;
  target: TargetResolver;
  env: Record<string, string | undefined>;
}

// ---- plan ------------------------------------------------------------------
export type Disposition = "create" | "overwrite" | "identical";

export interface PlannedFile {
  itemId: CanonicalId;
  sourcePath: string;              // files[].path, verbatim from the wire item
  wireType: string;                // "registry:ui" | ...
  destination: string;             // ABSOLUTE, proven inside root
  content: string;                 // shipped verbatim; never transformed
  sha256: string;                  // of `content`
  existing: { sha256: string } | null;   // pre-image hash, for TOCTOU + disposition
  disposition: Disposition;
}

export interface PlannedDependency {
  name: string;                    // "@mantine/core"
  range: string;                   // "^9"
  dev: boolean;
  wantedBy: CanonicalId[];
}

export type ThemeSourceKind = "absorbed-file" | "meta-fragment";

export interface PlannedTheme {
  destination: string;             // ABSOLUTE = resolved config.theme
  base: { sha256: string } | null; // null when the file does not exist yet
  text: string;                    // FINAL folded text — apply writes exactly this
  sha256: string;
  changed: boolean;                // false => apply skips phase 4 entirely
  added: string[];
  importsAdded: string[];
  conflicts: MergeConflict[];      // re-exported from mantine-registry-kit
  sources: { itemId: CanonicalId; kind: ThemeSourceKind; path: string }[]; // fold order
}

export type MantineInstall =
  | { state: "found"; version: string; from: string }
  | { state: "not-installed" }
  | { state: "no-node-modules" }
  | { state: "undeterminable"; reason: "pnp" | "no-version" | "unparseable"; marker?: string };

export interface PlanItem {
  id: CanonicalId;
  namespace: string | null;
  name: string;
  wireType: string;
  sourceUrl: string;               // REDACTED
  requestedBy: (CanonicalId | "<root>")[];
  dependsOn: CanonicalId[];
  requires?: string;               // meta.mantine.requires, only when validRange
  provider?: string;               // meta.mantine.provider identifier
  stylesApi?: Record<string, string[]>;
  files: PlannedFile[];            // theme-destination files are NOT here (see §4)
}

export interface Plan {
  version: 1;
  root: string;                    // absolute project root = dirname(mantine.json)
  configPath: string;
  items: PlanItem[];               // topologically sorted, lexicographic tiebreak
  files: PlannedFile[];            // flattened in item order — the write list
  dependencies: PlannedDependency[];
  packageManager: PackageManagerName;   // from nypm, resolved at plan time
  installCommand: string | null;   // exactly what apply will run, corepack prefix included
  theme: PlannedTheme | null;
  mantine: MantineInstall;
  diagnostics: Diagnostic[];
  ok: boolean;                     // see refusal contract below
}

export interface PlanOptions {
  force?: boolean;
  overwrite?: boolean | "no";
  interactive: boolean;
}

export declare function plan(
  config: LoadedConfig, refs: string[], options: PlanOptions,
): Promise<Plan>;

export declare function apply(
  plan: Plan, options: ApplyOptions,
): Promise<ApplyOutcome>;
```

`plan.ok` is computed **inside** the gate aggregator, after `--force` is applied:

```ts
ok = diagnostics.every(d =>
  d.severity !== "error" || (d.forceable && options.force === true));
```

`apply()` reads `plan.ok` and never re-derives a verdict. `--force` never *silences* a diagnostic; it flips its severity to `"warn"` and both the printed report and `--json` still carry it.

### Refusal contract (one table, every path)

| Code | Severity | Forceable | Phase | Exit |
|---|---|---|---|---|
| `target-collision` (two distinct ids, one destination) | error | **no** | plan | 1 |
| `receipt-collision` (different recorded owner at this destination) | error | **no** | plan | 1 |
| `target-escapes-root` | error | **no** | plan + apply preflight | 1 |
| `target-refused-type` (registry:style/base/theme/item at file level) | error | no | plan | 1 |
| `file-no-content` | error | no | plan | 1 |
| `theme-base-unmergeable` | error | yes | plan | 1 |
| `dependency-range-conflict` (ranges provably disjoint) | error | yes | plan | 1 |
| `mantine-version-mismatch` (state `found`, `satisfies` false) | error | **yes** | plan | 1 |
| `receipt-unreadable` | error | yes | plan | 1 |
| `unknown-namespace`, `missing-env`, `fetch-failed`, `wire-invalid` | error | no | plan | 1 |
| `depth-exceeded`, `node-limit`, `response-too-large` | error | no | plan | 1 |
| `meta-invalid-requires`, `bare-dep-unresolvable` | error | no | plan | 1 |
| `no-package-manager` | error | no | plan | 2 |
| `destination-exists` + non-interactive + neither `--overwrite`/`--no-overwrite` | error | via `--overwrite` | plan | 1 |
| `init-framework-unrecognized`, `init-framework-ambiguous`, `init-framework-mismatch`, `init-config-conflict` | error | no | init plan | 2 |
| `init-source-unsupported`, `init-postcss-unsupported`, `init-path-escapes-root` | error | no | init plan | 1 |
| `css-unsupported`, `css-dependency-missing` | error | no | plan | 1 |
| `global-styles-unconfigured`, `global-styles-uninitialized` | error | no | plan | 1 |
| `global-styles-drift` | error | yes | plan | 1 |
| `jsconfig-typescript-unsupported` (jsconfig-only project, item ships `.ts`/`.tsx`) | error | **no** | plan | 1 |
| `verification-script-unavailable` (root package scripts unreadable/malformed, or configured definition absent/non-string) | error | **no** | plan | 1 |
| `mantine-version-unknown`, `mantine-malformed-metadata`, `mantine-non-core-unsatisfied` | warn | — | plan | 0 |
| `provider-missing`, `dependency-range-narrowed`, `bare-dep-assumed-local`, `dependency-cycle`, `resolution-applied`, `name-mismatch`, `meta-degraded`, `theme-conflict`, `receipt-stale` | warn | — | plan | 0 |
| `styles-api`, `receipt-drift` | info | — | plan | 0 |
| `update-conflict` (both sides changed incompatibly, local file missing, or new upstream file collides with unowned local source) | error | **no**; `--take-upstream` changes the requested operation | plan | 1 |
| `merge-base-unreadable` (version-3 receipt base missing, corrupt, or unreadable) | error | **no**; `--take-upstream` is not gated by a *missing or corrupt* ancestor, only by an *unusable output path* | plan | 1 |
| `target-reserved` (registry file targets Manteen's `.manteen/` state tree) | error | **no** | plan | 1 |
| config error (missing/malformed/unresolvable alias) | — | — | load | 2 |
| user cancel at a prompt | — | — | CLI | 130 |

The Exit column is per-code, not per-run: when rows co-fire, the higher exit wins — a jsconfig-only project that also lacks a package manager exits 2 on `no-package-manager`, so `jsconfig-typescript-unsupported`'s 1 is the code's own exit, not the only one observable.

Exit convention extends the kit's (`src/cli/index.ts` exits 2 on unknown command): **0** applied, **1** refused or failed, **2** usage/config, **130** cancelled.

---

## 2. Phases

### Phase 0 — Skeleton, build, and the guards that make every later phase checkable

**Ships:** `package.json`, `tsdown.config.mjs` (copied from the kit including its flat-dist rationale comment), `README.md`, a commander program with `--version`/`--cwd` and one stub subcommand, `scripts/guard-runtime-apis.mjs`, `e2e/dist-shape.node-e2e.mjs`.

**Unblocks:** everything. The flat-dist + kit-external contract is what `schema/` resolution and `createWireValidator()` both depend on.

**Done when:**
- `bun --cwd=packages/cli run build && node packages/cli/dist/cli.mjs --version` prints the version under real `node` (not bun).
- `ls packages/cli/dist` lists only files — no subdirectories — and `resolve(distDir, "../schema/mantine.schema.json")` exists.
- A script executed by `node` imports the **built** `dist/index.mjs`, calls the kit's `createWireValidator()`, and validates `public/r/empty-state.json` with zero messages. (Fails if tsdown ever inlines the kit.)
- `guard-runtime-apis.mjs` exits 1 on a synthetic file containing `import.meta.dir` and exits 0 on one containing `import.meta.dirname` — proving the `import\.meta\.dir(?!name)` lookahead. It also flags `Bun.` and `bun:` specifiers. The two existing offenders (`packages/registry-kit/test/build-registry.test.ts:14`, `test/registry.test.ts:6`) are migrated to `import.meta.dirname` so the guard can cover `test/**` too.

### Phase 1 — Config: `mantine.json`, schema, aliases

**Ships:** `schema/mantine.schema.json`, all of `src/config/`, and a real `mantine config` subcommand that prints the resolved configuration.

**Unblocks:** the `TargetResolver` port, which the resolver's collision check cannot exist without.

**Done when:**
- In a fixture with `paths` keys backing all four aliases, `mantine config` prints, per alias, the tsconfig `paths` key that backs it and a sample resolved destination.
- In `fixtures/consumer/specific-paths` (a copy of this repo's own tsconfig: `@/components/ui/*`, `@/hooks/*`, `@/lib/*`, `baseUrl: "."`), `mantine config` exits **2** naming `aliases.components` and listing those three keys verbatim. *(This fixture is a refusal case, not a success case — see decision D3.)*
- With `mantine.json` absent, exit 2 and stderr contains the searched absolute directory plus a complete, valid minimal `mantine.json`; no file is created; `components.json` is `existsSync`-probed only (asserted with an fs-read spy) and adds one line when present.
- `@private` is configured with `Authorization: Bearer ${REGISTRY_TOKEN}` and the variable is unset — `mantine config` still exits 0, because expansion is lazy.
- With `REGISTRY_TOKEN=s3cret` in a `params` entry, no printed line and no thrown message contains `s3cret`; the literal `${REGISTRY_TOKEN}` appears instead.

### Phase 2 — Resolver: the graph, the ports, the collision fix

**Ships:** `schema/mantine-item-meta.schema.json`, all of `src/plan/` except `theme-fold.ts` and the gate wiring; `mantine add --dry-run` printing a plan.

**Unblocks:** gates (they consume `ResolvedGraph`) and apply.

**Done when:**
- With all four namespaces registered (`@house` from the repo-root catalog, `@base`/`@kit`/`@product` from `packages/registry-kit/fixtures/*`, compiled at test setup via the kit's `compileRegistry` + `writeRegistry`), `mantine add @product/alert-panel --dry-run` prints exactly `@base/empty-state`, `@kit/callout`, `@product/alert-panel` in that order with their destinations, and opens zero sockets.
- Fifty runs with randomized loader microtask delays produce byte-identical output.
- `mantine add @house/empty-state @base/empty-state --dry-run` exits 1 with exactly one `target-collision` naming both ids, both source paths and the shared destination; reversing the argument order produces an identical message; a filesystem hash manifest of the project is unchanged.
- `mantine add @base/empty-state @base/data-grid --dry-run` (same id reached directly and transitively) does **not** refuse and lists `@base/empty-state` once.
- A memory doc with `meta.mantine.requires = 12345` — which the kit's wire validator accepts, because the wire schema declares `meta` as `additionalProperties: true` — produces `meta-invalid-requires` at severity error and no `requires` on the PlanItem.

### Phase 3 — Gates and the theme fold: `ResolvedGraph` becomes `Plan`

**Ships:** all of `src/gates/`, `src/plan/theme-fold.ts`, `src/fs/walk.ts`, `src/plan/index.ts`.

**Unblocks:** apply, which becomes a pure sequencer over precomputed bytes.

**Done when:**
- Temp project with `node_modules/@mantine/core/package.json` = `8.2.1` and a *deliberately conflicting* `"@mantine/core": "^9"` in the consumer's own `package.json`: `mantine add @house/data-table --dry-run` exits 1 with **one** grouped block — installed version, the path it was read from, then each distinct range with the items wanting it. Proves the gate reads the installed version, not the range.
- Same project at `9.5.0` exits 0 and prints a unified theme diff for `src/lib/theme.ts` showing `Skeleton` and `Table` added, with `Button`/`Card`/`Paper`/`Modal` entries still present.
- A `src/lib/theme.ts` exporting a plain object with no `createTheme(` call exits 1 with `theme-base-unmergeable` naming the file and the required shape — the kit's `findThemeObject` throw (merge-theme.ts:96–113) surfaces as a plan-time refusal, never as an exception after files are written.
- `.pnp.cjs` at the project root produces `mantine-version-unknown` whose message names Yarn PnP explicitly, exit 0 — never the string "not installed".
- `mantine add @house/stat-card --dry-run` prints `StatCard: root, label, value, trend` and contributes nothing to `refused`.
- A project with no `MantineProvider` anywhere: exit 0 **and** a `provider-missing` warning on stderr. Both asserted — a silent exit-0 and an exit-1 are each regressions.

### Phase 4 — Apply, and the CLI surface around it

**Ships:** all of `src/apply/`, `src/ui.ts`, full commander wiring (`--cwd --force --overwrite --no-overwrite --dry-run --yes --pm --no-corepack --verbose --json`).

**Done when:**
- `mantine add @house/data-table` into a temp project writes `data-table.tsx` + `use-data-table.ts` at paths-resolved destinations and one merged `src/lib/theme.ts`. Re-running reports every destination identical, writes nothing, and the theme file's sha256 is unchanged (`plan.theme.changed === false` skips phase 4).
- Injecting ENOSPC on write 3 of 4 restores files 1–2 to their pre-images, removes file 3's temp, leaves no `.mantine-tmp-*`, exits 1 — and `package.json` still shows the deps installed, asserting the deliberate non-rollback.
- Cancelling at the overwrite prompt exits 130 with `addDependency` never called, proving decisions precede installs.
- `CI=true` + non-TTY + an existing differing destination + no flags exits 1 with a message containing both `--overwrite` and `--no-overwrite`, and the existing file is byte-identical. A companion guard asserts `CI=1` does **not** take the non-interactive branch (see D14).
- Mutating a planned destination between `plan()` and `apply()` exits 1 telling the user to re-run; the file retains the user's edit.

### Phase 5 — `manteen init`

**Ships:** `src/init/*` for Tier A (Vite, Next App Router, Next Pages Router, React
Router): finite framework detection, PostCSS create-or-patch planning, bounded tsconfig/Vite config
patches, entry-point codemods, theme/config scaffolds, dependency planning, exact-byte preflight,
transactional apply, production ports and the text/JSON `manteen init` shell. Tier B is
`--framework manual`: shared automation plus a structured required integration instruction.

**Verified 2026-07-29:**
- Vite fixture with a pre-existing `postcss.config.mjs`: `manteen init --dry-run` shows a patch to the `.mjs` and **no** new `postcss.config.cjs`. The same assertion holds for a non-Tailwind Next fixture. *(Both directions — postcss-load-config searches `.cjs` before `.mjs`, Next searches it before `.cjs`; either way a new file is never created when one exists.)*
- The emitted PostCSS config carries `postcss-preset-mantine` and `postcss-simple-vars` with `mantine-breakpoint-{xs,sm,md,lg,xl}` = `36em/48em/62em/75em/88em`.
- The emitted `@house` registry declares both its item URL and index URL. A hermetic built-Node `init → list` case consumes the generated object through a compiled `file:` registry, and the exact legacy string form migrates without dropping authored registries or resolutions.
- A Vite SPA using `react-router` as a library (no `@react-router/dev`, no `app/root.tsx` — mantinedev/vite-template's shape) detects as Vite.
- A hybrid Next project produces edits to `app/layout.tsx`, `pages/_app.tsx` **and** `pages/_document.tsx`.
- The emitted theme scaffold, passed to the kit's `mergeThemeSource` against `packages/registry-kit/fixtures/base/src/data-grid.theme.ts`, merges without throwing.
- The built-Node tier runs Vite, Next App, Next Pages, Next hybrid and React Router through dry-run, apply, `loadConfig()` and an empty second mutation plan. Generated metadata, document machinery, providers/props, app bodies and styles survive.
- Current default Next Tailwind output keeps `postcss.config.mjs` byte-identical and exits 0 with `ok: true`, `complete: false` plus the exact required Mantine block in both text and JSON.
- Detection/config/transform refusals and declined confirmation are zero-mutation. Install failure precedes journal creation; write failure unwinds every init file through the shared journal.
- An active PostCSS object inside `package.json` plus missing init dependencies refuses with `init-config-conflict`: install and an exact-byte config patch cannot safely own the same manifest in one run.
- **The Phase 1 missing-config hint now directs the user to `manteen init`** instead of claiming the command does not exist.

### Phase 6 — Release hardening

**Ships:** CI matrix (Node 22.12 / 24 / 26 running the built e2e tier; macOS at the Node floor;
`windows-latest` running the tier plus one packed install to check `^` survival through `.cmd`
shims), packed npm/pnpm/Yarn/Bun consumer smokes, publish ordering (kit first; the client declares
the real `manteen-kit@^0.1.0` range), README.

**Done when:** the e2e tier passes on all named Node/OS runners, and packed `manteen-kit` plus
`manteen` installed into disposable consumers can run `manteen add` against a `file:` registry
through npm, pnpm, Yarn PnP and Bun. Windows must exercise its native `.cmd` shim.

---

## 3. First slice

The smallest vertical that proves the architecture end to end: **config load → paths-key alias validation → local loader → wire+meta validation → destination resolution → collision check → apply → file on disk**, executed by real `node` against `dist/`.

**Command it must satisfy:**

```bash
cd /tmp/slice-project
node <repo>/packages/cli/dist/cli.mjs add @base/empty-state
```

**Files to write (in order):**

1. `packages/cli/package.json` — `type: module`, `engines.node >=22.12`, `bin.manteen`, `exports` with `.mjs`/`.d.mts` and `"./schema"`, `files: ["dist","schema","README.md"]`. Deps for the slice: `manteen-kit` (`^0.1.0`; Bun links the matching workspace package locally), `commander ^15`, `ajv ^8`, `get-tsconfig ^4.14`. Dev: `tsdown`, `@types/bun`. *(No `@types/diff` — diff@9 ships its own types. `@types/semver` is required when semver lands in phase 3.)*
2. `packages/cli/tsdown.config.mjs` — verbatim from the kit's, with `entry: { index: "src/index.ts", cli: "src/cli/index.ts" }`.
3. `packages/cli/schema/mantine.schema.json` — draft-07 with the **`http://`** dialect id (so no `delete schema.$schema` workaround is needed; only the kit's *vendored wire* schema declares the `https://` form). `additionalProperties: false`. Properties: `$schema?`, `registries` (keys `^@[a-z0-9-]+$`; values are either the `{name}` URL template or an object with required `url` plus optional `index`/`headers`/`params`), `aliases` (all four of `components`/`ui`/`hooks`/`lib` required), `theme?`, `tsconfig?`, `resolutions?`.
4. `src/config/types.ts` — `MantineConfig`, `RegistrySource`, `AliasKey`, `LoadedConfig`, `ConfigError` (carries `pointer` + `hint`).
5. `src/config/aliases.ts` — pure. Exports:
   ```ts
   export function matchesPathsPattern(
     specifier: string, paths: Record<string, string[]>,
   ): string | null;   // returns the winning key, or null
   export function createAliasResolver(
     tsconfig: TsConfigResult, aliases: Record<AliasKey, string>, root: string,
     exists: (p: string) => boolean,
   ): TargetResolver;
   export function assertInsideRoot(dest: string, root: string): void;
   export const WIRE_TYPE_ALIAS: Record<string, AliasKey>;
   export const REFUSED_FILE_TYPES: readonly string[];
   ```
   `matchesPathsPattern` implements TS's own rule (at most one `*`; exact patterns beat wildcards; longest static prefix wins) against the **parsed `paths` keys** and is the *only* detector of "this alias is unbacked". `createPathsMatcher` is called only to compute the destination once a key is known to match. Note the type is `TsConfigResult` (capital C), not `TsconfigResult`.
6. `src/config/validate.ts`, `src/config/registries.ts` (string/object normalization + `splitItemId` on the first slash), `src/config/load.ts` (`<cwd>/mantine.json` only, no upward walk; `config.tsconfig` resolved against the config's directory with **no `basename()`**, existence required).
7. `src/plan/types.ts` — the full type block from §1.
8. `src/plan/{ref,diagnostics,validate-item,loader-local,resolve}.ts` — `resolve()` without cycle detection or dependency union for the slice (`@base/empty-state` has no `uses`), but with canonical-id dedupe and the destination-collision pass already in place.
9. `src/gates/collision.ts` — destination grouping only.
10. `src/apply/{journal,write-files,index}.ts` — mkdir -p, temp+rename, journal.
11. `src/cli/index.ts` — `add [refs...]` with `--cwd` and `--dry-run`.
12. `packages/cli/e2e/first-slice.node-e2e.mjs`.

**Test setup the e2e file performs:**
`compileRegistry("packages/registry-kit/fixtures/base/mantine-registry.json")` + `writeRegistry(result, <tmp>/r)`, then a temp consumer with `tsconfig.json` = `{ baseUrl: ".", paths: { "@/components/ui/*": ["./src/components/ui/*"], "@/components/*": ["./src/components/*"], "@/hooks/*": ["./src/hooks/*"], "@/lib/*": ["./src/lib/*"] } }` and `mantine.json` = `{ "$schema": "…", "registries": { "@base": "file://<tmp>/r/{name}.json" }, "aliases": { "components": "@/components", "ui": "@/components/ui", "hooks": "@/hooks", "lib": "@/lib" } }`.

**Assertions:**
- exit 0; `<project>/src/components/ui/empty-state.tsx` exists and is byte-identical to `packages/registry-kit/fixtures/base/src/empty-state.tsx`.
- Re-running reports `identical` and the file's sha256 is unchanged.
- Adding a second registry `@collide` (from `packages/cli/fixtures/collide/`) that also publishes `empty-state` and running `add @base/empty-state @collide/empty-state` exits 1 with `target-collision` naming both ids, and a hash manifest of the project is unchanged.
- Changing `aliases.ui` to `"@/nope"` exits 2 listing the four `paths` keys actually present. **This is the assertion that would silently pass under `[] === unresolvable`** — with `baseUrl: "."` set, `createPathsMatcher("@/nope/empty-state")` returns `["<root>/@/nope/empty-state"]`, not `[]`, and files would land in a literal directory named `@`.

`file:` URLs are handled by `loader-local.ts` reading from disk directly — Node's `fetch` rejects `file:` with "not implemented… yet…", so the http loader is never on this path.

---

## 4. Decisions taken

| # | Decision | Rationale | Rejected alternative |
|---|---|---|---|
| D1 | An alias is "unbacked" iff no tsconfig `paths` **key** pattern-matches the specifier. `createPathsMatcher` returning `[]` is never used as the test. | Probed against get-tsconfig 4.14 with this repo's tsconfig (`baseUrl: "."`): `@/nope/x` → `["<root>/@/nope/x"]`, `src/components/ui/x` → `["<root>/src/components/ui/x"]`. With `baseUrl` set the matcher **falls back to `baseUrl + specifier` and never returns `[]`**, so files would land in a literal `@/` directory and `assertInsideRoot` would pass. | (a) `[] === unresolvable` — provably broken with `baseUrl`. (b) Comparing `candidate[0]` to `resolve(tsconfigDir, baseUrl, specifier)` — has a false-positive mode when a legit `paths` entry maps to exactly that, and two competing detectors is worse than one. |
| D2 | Destinations resolve **per file**: `matcher(`${alias}/${stemWithoutExt}`)`, then the original extension is re-appended. Never resolve the alias directory once. | This repo's `paths` are specific patterns (`@/components/ui/*`, `@/hooks/*`, `@/lib/*`) with no `@/*`; a pattern with a `*` needs a segment to bind it. Per-file is also what makes `extends` chains and multi-substitution entries behave. | Resolve each alias to a directory at load and join basenames — fails against the most likely consumer shape. |
| D3 | `fixtures/consumer/specific-paths` (this repo's tsconfig) is a **refusal** fixture, not a success fixture. A separate fixture with a key per alias covers success. | With all four aliases required and each needing a backing key, `aliases.components` is unsatisfiable against `@/components/ui/*` + `@/hooks/*` + `@/lib/*`. That tsconfig is an *authoring* config (it maps consumer aliases onto `registry/`), not a consumer one. Refusing with the three keys printed is correct and actionable. | Listing it as a success case — it cannot pass. |
| D4 | Alias values must be **import-path prefixes** backed by `paths`; a filesystem path (`"ui": "src/components/ui"`) is refused, not coerced. | Content ships verbatim. `registry/blocks/data-table/data-table.tsx:5` literally contains `import { EmptyState } from "@/components/ui/empty-state"`. A project whose tsconfig can't resolve that gets broken imports wherever we put the file. | Accept fs paths for projects without `paths` — produces a project that installs cleanly and does not compile. |
| D5 | **Any planned file whose destination equals the resolved `config.theme` is removed from the write list and folded through `mergeThemeSource` instead.** | Verified: the root catalog's `theme` item (kind `theme`) has one file `registry/lib/theme.ts` with `as: "lib"`; `ITEM_TYPE.theme → registry:lib` and `FILE_TYPE.lib → registry:lib` (build-registry.ts:70,76), so it resolves to `<lib>/theme.ts` — the same path `config.theme` names and the same path the fold writes. `fixtures/base` has the identical shape. All four theme files contain literal `createTheme({...})` calls, and merge-theme.ts:44–45 states a fragment is a valid standalone theme, so folding is exactly the kit's intended composition. This also makes `@house/theme` + `@base/theme` merge instead of colliding. | (a) Write then overwrite — `mantine add theme data-table` silently loses `primaryColor`, `defaultRadius` and four component entries, and the base-theme hash still verifies because it was taken before the write. (b) Blanket un-overridable collision refusal — blocks a case the kit's own `merge-theme` CLI exists to serve. |
| D6 | Fold order is topological, then lexicographic by canonical id. When no base exists on disk, the **first** source in that order becomes the base. Absorbed item files and `meta.mantine.themeFragment` entries fold in one sequence; `PlannedTheme.sources[].kind` distinguishes them. | `prefer: "base"` is first-write-wins on conflicting leaves (merge-theme.ts:195–208), so order is semantically load-bearing, not cosmetic. A dependency's fragment must land before its dependent's. | Promise-completion order — nondeterministic theme output and unsnapshot­table plans. |
| D7 | The **entire** theme merge runs in `plan()`. `apply()` performs one temp+rename write of `plan.theme.text`. | `mergeThemeSource` is pure (in-memory ts-morph, `useInMemoryFileSystem: true`, merge-theme.ts:57) and *throws* on an unmergeable base (`No \`createTheme(...)\` call found`, lines 101/107). Merging in apply puts a throw after component files are already on disk, violating "nothing touches disk until every check has passed". | Merge per fragment during apply — N writes, a reachable throw, and non-atomic intermediate theme states. |
| D8 | Identity dedupe keys on canonical id `@ns/name`. Destination-path collision is a **separate, blocking, non-forceable** check. | This is the fix for the shipped bug. Deduping by destination is what let `@base/empty-state` overwrite `@house/empty-state`. `@house`'s `EmptyStateProps` has `{title, description, icon, action}`; `@base`'s takes `{title}` only — picking either breaks the other's callers, so there is no correct user answer at the prompt. | (a) Prompt for a winner — a UI for choosing which typecheck to break. (b) Auto-rename the destination — content is verbatim and `data-table.tsx` imports `@/components/ui/empty-state` literally. |
| D9 | `resolutions: { "empty-state": "@house/empty-state" }` is the durable escape hatch, and applying one emits a **warning** (not info) naming loser, winner, and every dependent whose import was redirected. | Blocking with no way forward is unusable when two registries legitimately ship a common name. It must persist for CI determinism, so it belongs in config. Warning because a resolution substitutes a differently-typed implementation behind an authored import specifier — `resolutions: {"empty-state": "@base/empty-state"}` redirects `data-table.tsx:51`'s `<EmptyState title description />` onto a component with no `description` prop. | (a) `--force` only — non-durable, re-decided every run, doesn't say which won. (b) Info severity — understates a direction-dependent hazard. |
| D10 | npm range reconciliation order: `parseNpmSpec` splits on **`lastIndexOf("@")`** → `semver.validRange()` guard (null ⇒ `mantine-malformed-metadata` warn, never a refusal) → `semver.intersects()` false ⇒ blocking `dependency-range-conflict` → `semver.subset()` narrower wins → whole thing in try/catch. | Probed semver 7.8.5: `subset("workspace:*", ">=9")`, `subset("latest", ">=9")` and `intersects("garbage", ">=9")` all **throw** `Invalid comparator`, unlike `satisfies` which returns `false`. `subset("^9","^10")` and `intersects("^9","^10")` are both false — disjoint, not merely incomparable, so a plan must not pick one by graph depth. `subset("*", ">=9") === false` while `intersects` is true, so `subset` alone must never refuse. Every npm entry in this repo is `"@mantine/core@^9"` — a scoped name with an embedded `@`, so first-slash splitting is wrong. | Treating `^9` vs `^10` as a warning — the gate fails open, which is the one thing it exists to prevent. |
| D11 | The version gate has **four** outcomes (`found` / `not-installed` / `no-node-modules` / `undeterminable`) with four distinct messages. Only `found` refuses. Comparison uses `{ includePrerelease: true }`. Every `requires` passes `semver.validRange()` first. | Different remedies: `not-installed` means the plan installs Mantine itself (every catalog item declares `@mantine/core@^9`), so refusing would break the greenfield flow; `undeterminable` under Yarn PnP must say so rather than claim "not installed". `satisfies("9.5.0","garbage")` returns `false` without throwing, so an author typo would otherwise become an unclearable blocker. `satisfies("9.0.0-alpha.1",">=9")` is false by default, true with the flag — refusing someone who deliberately opted into a prerelease is a semver technicality, not a compatibility fact. | Collapsing non-`found` into "not installed" — actively wrong under PnP. |
| D12 | Locate `@mantine/core` by walking `node_modules/@mantine/core/package.json` upward from the config directory. Never `require.resolve("@mantine/core/package.json")`. | Its `exports` map declares only `.`, `./styles.css`, `./styles.layer.css`, `./styles/*` — the subpath resolve throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. The upward walk follows bun/pnpm store symlinks and matches Node's nearest-wins in a monorepo. Regression test states this **positively**: a fixture whose exports map omits `./package.json` still resolves to `found`. | Asserting a negative about a builtin with no injectable seam. |
| D13 | The provider check fires when an item declares `meta.mantine.provider` **or** any planned file's `content` imports from `@mantine/core`. It always WARNS. | Only 1 of 5 items in this repo's catalog sets `provider: true` (the `theme` item), yet `stat-card.tsx`, `empty-state.tsx` and `data-table.tsx` all import `@mantine/core` and genuinely need a provider — `build-registry.ts:114` emits `meta.provider` only on author opt-in. Content is already in the Plan, so the broader trigger costs nothing. It warns because it can report *satisfied* falsely — an identifier in `.storybook/preview.tsx` counts — and a check that can report a false pass must never be load-bearing. The declared identifier wins when present, so a future `ModalsProvider` needs no client change. | Trusting the metadata flag alone — silent for the four components most likely installed standalone. |
| D14 | Interactivity is `isTTY && !isCI() && !--yes`, and **`CI=true` is a stated invariant**, not just an e2e env var. | Probed @clack/prompts 1.7.0: `isCI = () => process.env.CI === "true"`. `CI=1` evaluates to **false**, so a harness or workflow setting `CI=1` silently takes the interactive branch and blocks forever on a prompt. A guard test asserts both directions. `--yes` implies `--overwrite`. | Assuming any truthy `CI` works. |
| D15 | Package-manager detection runs in `plan()` with `detectPackageManager(root, { includeParentDirs: false, ignoreArgv: true })` and a `--pm` override; `undefined` becomes a plan-stage `no-package-manager` failure. `apply()` always passes an explicit `packageManager`. | Verified: detection returns `undefined` (not a throw) with no lockfile and no `packageManager` field, and `addDependency` then throws *even with `dry: true`* because detection happens during option resolution — so the throw is unavoidable at call time and must be converted before any prompt. `includeParentDirs` defaults true, so a stray ancestor lockfile silently decides the PM; the argv fallback regex-matches `process.argv[1]`, so invoking via a path containing `/bun` or `/.npm/_npx/` fakes a detection. | Catching the throw in apply — by then the user has answered prompts. |
| D16 | `addDependencyCommand` takes **no `corepack` option** and never emits a corepack prefix; `plan.installCommand` is built from nypm's own corepack predicate so the printed escape hatch matches what actually ran. | Probed nypm 0.6.9: `addDependencyCommand(pm, names, { dev?, global?, yarnBerry?, workspace?, short? })` — passing `corepack: false` is an excess-property compile error and a runtime no-op. `addDependency` *does* prefix `corepack` for non-npm/bun/deno managers when `corepack --version` exits 0. `addDependencyCommand(undefined, ["a"], {dev:true})` returns `"add --dev a"` — an unrunnable string with no binary — so `undefined` must never reach it. | Passing `corepack:false` to the command builder — mitigates a risk that function does not have, and doesn't compile. |
| D17 | Dependency specs are filtered out only when **both** the installed version satisfies the range **and** the name is already declared in the consumer's `package.json` (`dependencies`/`devDependencies`/`peerDependencies`, or a `workspace:`/`link:`/`file:` protocol entry). | Every catalog item declares `@mantine/core@^9`; without a filter every install rewrites a consumer's deliberate `9.5.0` pin. But filtering on node_modules alone means a hoisted or transitive `@mantine/core` yields written components importing a package the project never declares — the exact "imports packages that were never installed" failure deps-first ordering exists to prevent. | Filtering on installed version alone — enshrines the hole. |
| D18 | Apply phase order: 0 preflight (read-only) → 1 decide/prompt (read-only, one grouped multiselect) → 2 install deps → 3 write files → 4 write theme → 5 report. Phases 3 and 4 share one pre-image journal; phase 2 is outside it. Every write, including the theme, goes temp + `renameSync`. | Deps-first means the most likely failure (network + subprocess) leaves the source tree untouched, and leftover deps are inert while source importing missing packages is a broken build. All decisions in phase 1 means cancel is always zero-mutation. Rename-within-directory is atomic on POSIX, so a crash cannot truncate a file the user owns — and `src/lib/theme.ts` is by definition the most hand-edited file in the set, so it gets the same treatment. Package managers are not transactional, so `removeDependency` after a partial install can remove something pre-existing. | Direct `writeFileSync` for the theme; rolling back deps. |
| D19 | `--dry-run` runs `plan()` **plus** apply's read-only phases 0 and 1, then exits 0 without entering phase 2. | The uniqueness, containment and hash invariants live in apply's preflight as defence in depth. A "plan-only" dry run structurally cannot report the collision it exists to preview — the user would see a clean preview then exit 1. | A `--dry-run` flag threaded through the writes; a preview that skips preflight. |
| D20 | `meta.mantine` is validated against a CLI-vendored schema that is **strict on the four keys we act on and open to unknown keys**. `requires` fails closed (error); `stylesApi`/`themeFragment` fail open (warn, field dropped). A file with no `content` is a blocking error. | The wire schema declares `meta` as `additionalProperties: true`, so `{ requires: 12345, junk: true }` passes the kit's validator — and every Mantine-specific behavior reads `meta.mantine`. Open-on-unknown gives forward compatibility with a newer kit by construction. `requires` is a safety mechanism; `stylesApi` is documentation. The wire schema requires only `path` and `type`, so a contentless file validates, and we have no second channel to fetch bytes — writing an empty file over a user's component is the worst outcome. | Trusting `meta.mantine` and type-checking at each use site — scatters the same checks across three dimensions and produces `semver.validRange(12345)`-shaped errors. |
| D21 | Registry URL values must contain the literal `{name}`, enforced by a `pattern` in the config schema. Per-registry `index?` is an optional second URL used by `list`, `info` and did-you-mean on 404. | One rule beats guessing whether to append `/{name}.json`; a wrong guess produces a 404 that reads as a missing item. Deriving the index by substituting `name="registry"` happens to work for the kit's emitted layout but breaks for any other template shape — so it is a declared field, not an inference. | Accepting a bare base URL; inferring the index. |
| D22 | Refused **file-level** types are `registry:style`, `registry:base`, `registry:theme`, `registry:item`. `registry:font` is refused at the **item** level only. | The wire schema has two enums: the item-level `type` enum includes `registry:font`, the file-level `files[].type` enum has 11 entries and omits it. Since `destinationFor` dispatches on the file type, a font branch there is unreachable and its test would have to bypass validation to construct its input. | Listing `registry:font` in the per-file refusal table. |
| D23 | `splitItemId` splits on the **first** slash and keeps multi-segment names whole, justified by third-party registries and shadcn's nested item names — **not** by the kit. | The kit cannot emit a nested name: `writeRegistry` (build-registry.ts:211) does `writeFileSync(join(outDir, \`${item.name}.json\`))` after a single `mkdirSync(outDir)`, so `blocks/data-table` would ENOENT at build time. Lines 138–140 only prefix a bare `used` with the namespace. | Citing build-registry.ts:138–140 as evidence for nesting. |
| D24 | `mantine-registry-kit` is a runtime dependency kept external, and the config schema declares the **`http://`** draft-07 dialect id so no `delete schema.$schema` is needed. | Probed ajv 8: the `http://` form compiles fine; only the `https://` form throws `no schema with key or ref`. Only the kit's *vendored wire* schema uses `https://` — which is exactly what build-registry.ts:84–88 says. Copying the delete into a schema we author ourselves ships a misleading comment in the module whose stated job is keeping the gotcha discoverable. | Copying the workaround verbatim. |
| D25 | Bounded walk: depth ≤ 20, nodes ≤ 200, ≤ 8 MB per response, concurrency 6 per wave with each wave sorted by canonical id before dispatch. Cycles WARN, never refuse. | File contents are inlined (`data-table.json` is already multi-KB of embedded source) and the plan is fully materialized in memory, so a hostile or looping registry needs a ceiling. Cycles are legal TypeScript — we copy files, we do not evaluate them — and Kahn's algorithm still needs a defined answer, so SCC members emit in id order. | Unbounded walk; hard error on cycle. |
| D26 | Registry authors declare package styles as `css: string[]`; the kit emits the existing wire `css` object with one empty-object `@import` key per entry. The client accepts only this import-only subset. | It uses an existing interchange channel while keeping the executable contract narrow enough to validate and compose deterministically. | A new `globalStyles` wire extension; accepting shadcn's full Tailwind-aware CSS surface. |
| D27 | Every accepted CSS import is an exact bare package subpath and its package must appear in the same item's runtime `dependencies`. Relative/URL/media imports, declarations, selectors, other at-rules and dev-only dependencies refuse. | Copied source needs the stylesheet at consumer runtime. Resolving local paths or interpreting arbitrary CSS would turn the client into a stylesheet compiler with framework-dependent semantics. | Best-effort filtering or silently dropping unsupported entries. |
| D28 | `manteen.json` explicitly names one Manteen-owned stylesheet. `init` creates and wires it after Mantine Core styles and before host CSS; consumer overrides remain in host CSS, which Manteen never rewrites. | The disposable framework probe proved this ordering across supported shapes, and explicit ownership makes drift and recovery intelligible. | Injecting imports into host CSS; relying on every copied component to import package CSS. |
| D29 | Global styles are one composed plan artifact with dependency-first/canonical source order, first-occurrence import dedupe, exact-byte hash, dry-run/preflight coverage and the same journal as files/theme. | Multiple installed items may contribute or share imports; item-local writes cannot preserve untouched contributions or roll back atomically. | Treating `manteen.css` as an ordinary file owned by the latest item. |
| D30 | **Superseded by D32 on 2026-08-05 — recorded as history, not as current behavior.** Receipt v2 added nullable `styles`; the v1 schema was frozen alongside it, and a valid v1 receipt migrated only in memory for reads, written as v2 only after a successful mutation. D32 replaced both: v3 is the only accepted version, v1/v2 are rejected rather than migrated, and `schema/manteen.lock.v1.schema.json` was deleted. | Read-only commands must not create surprise diffs, while future mutations need a truthful ownership baseline. The migration path this row bought was retired once the owner confirmed there were no consumer projects to serve. | Mutating on read; making v1 unreadable; extending the v1 schema in place. Since D32, also: reading this row as the live contract. |
| D31 | Missing configuration/uninitialized ownership refuses non-forceably; drift in the explicitly Manteen-owned stylesheet refuses forceably and tells the user to move overrides to host CSS. | The client cannot safely guess or adopt unknown bytes. Once ownership is explicit, `--force` has a precise meaning: restore the receipt-derived artifact without touching consumer CSS. | Ignoring drift; rewriting host CSS; making every drift unrecoverable. |
| D32 | Receipt v3 records `installedSha256` and `baseSha256` per ordinary file, and the exact pristine base lives at `.manteen/bases/<destination>.base`. Versions 1 and 2 are rejected rather than migrated. | A three-way merge needs the ancestor bytes, while drift since the last accepted result and ancestry against upstream are different facts. There are no active consumer projects whose legacy receipts justify permanent compatibility branches. A committed sidecar is reproducible across clones without turning the JSON receipt into escaped source. | A machine-local cache silently downgrades on another machine; embedding source in JSON makes every review read escaped duplicate files; Git-history inference cannot identify an install point that may never have been committed. |
| D33 | `plan()` has an explicit add/update operation. `add` keeps verbatim skip-or-overwrite semantics; default `update` plans `base + local + incoming` and writes only incoming or a conflict-free three-way result. | Reinstalling and maintaining user-owned source are different requests. Routing both through one disposition erased that distinction and made a local-only file eligible for destructive overwrite with no upstream gain. | Special-casing in apply — too late for dry-run, diagnostics, conflict refusal, or the all-decisions-before-mutations property. |
| D34 | A default update keeps local-only changes, applies upstream-only changes, and refuses conflicts before mutation. `--take-upstream` is the only update spelling that discards local changes; update no longer accepts `--overwrite`, `--no-overwrite`, or `--yes`. Because it consults no ancestor, it is also the repair path for a lost or corrupt base. | The command should mean “bring upstream forward around my adaptations.” A generic overwrite flag hides the exact destructive choice users need to understand. Once the ancestor is lost and cannot be reconstructed, recovery must choose a side; `--take-upstream` names that destructive choice explicitly and rebuilds the sidecar coherently. | Keeping the old flags as aliases — preserves the trap under familiar automation and makes `--yes` mean data loss. Refusing `--take-upstream` for a missing base — leaves `add --overwrite` as the sole escape and hides the same destructive reset behind reinstall semantics. |
| D35 | Merge computation is exact, line-oriented, and entirely in plan. Conflict markers never reach live files by default, and `--force` cannot clear a merge/base refusal. | A conflict is a decision, so D18 requires it above dependency installation and journalling. Writing markers creates broken source while reporting success; forcing without choosing a side is not a resolution. | Letting Git or an apply-phase subprocess write conflicts — introduces a runtime dependency and moves a reachable failure below mutation. |
| D36 | Base sidecars are Manteen-owned, are written through the same journal after project files and before the receipt, and are preflight-hashed. `.manteen/` is a reserved registry destination. | Project bytes, their ancestor, and the receipt form one transaction. A receipt that points at a base that did not land is as untruthful as one that claims a project file that rolled back. | Cache writes outside the journal; accepting registry output inside the state tree. |
| D37 | A locally missing tracked file conflicts unless `--take-upstream` restores it. A file removed upstream is reported and retained; this milestone performs no inferred source deletion or rename. | Absence can be an intentional project edit, and delete/rename attribution is a separate contract. Conservative retention is recoverable and makes the deferred boundary visible. | Automatically restoring every missing file; guessing rename from similar contents; silently deleting a locally adapted file. |
| D38 | `diff` renders `base -> local`, `base -> incoming`, and `local -> proposed result`, and labels a clean textual result “conflict-free,” never semantically safe. | Once the ancestor exists, a two-way on-disk-to-upstream patch understates what update will do and cannot explain which side contributed a hunk. A text merge cannot prove application behavior. | Keeping the old patch and adding “merged” copy around it — a product claim unsupported by the bytes shown. |
| D39 | After a successful non-preview `add` or `update` actually changes the receipt or a pristine base, apply reports that observed state mutation and the text CLI emits one `state-versioning-required` advisory at `info`. Update JSON carries the same fact structurally. Manteen does not inspect Git or claim the state is tracked. | Receipt v3 and `.manteen/bases/` are one reproducible update unit, but neither Git presence nor ignore status can prove that a future commit will contain both. An apply-time fact is exact about what this run changed and avoids turning read-only `diff` into a version-control warning. `info` rather than `warn` follows from the same Git-blindness: unable to tell a project that already versions both from one that ignores them, it fires on essentially every successful `add` and `update`, and a warning present on the whole happy path devalues the conditional warnings printed beside it. | Shelling out to Git makes a Git-independent Node tool depend on one VCS and still cannot prove a future commit; parsing `.gitignore` incompletely produces reassuring false passes; a plan diagnostic fires before apply knows whether state changed; `warn` for a standing storage fact trains readers to skip the severity that also carries `provider-missing` and `theme-conflict`. |
| D40 | Post-update verification is opt-in, project-owned, and outside `apply()` and its journal. Ordered configured package scripts are resolved in plan, run fail-fast after every successful non-dry update (including a byte-identical update), and reported on `UpdateResult`, never `ApplyOutcome`. Planning hashes the whole root `package.json`; preflight checks that hash, post-apply orchestration revalidates the exact script definitions, snapshots the receipt, its ordinary destinations/bases and recorded current theme/styles, `manteen.json`, and `package.json`, then detects drift after each check. A failed check exits 1 but leaves the coherent update applied. | A consumer's own typecheck/test/build is the only honest way to move beyond “conflict-free text,” while arbitrary scripts can mutate files the Manteen journal does not own. Separating the completed transaction from verification preserves rollback truth and makes applied versus verified independent facts. Exact definitions prevent a dependency lifecycle script from substituting a command, and the bounded snapshot detects invalidated ownership state without claiming to sandbox project code. | Running scripts inside the journal and claiming rollback; inferring scripts; accepting shell strings in config; executing a changed definition; persisting an environment-specific certificate in the receipt; describing a verification failure as an unapplied update. |

---

## 5a. Resolutions — decided 2026-07-28

The seven open questions below are **closed**. This section overrides them and §6 where they disagree.

| # | Question | Decision |
|---|---|---|
| 1 | Dotenv floor | **Accepted, then revised upward to `>=22.12`.** Call `process.loadEnvFile` unguarded; `process.env` wins over file values. See below. |
| 2 | Install receipt | **REJECTED — the receipt ships in v1, not v1.1.** See below. |
| 3 | `resolutions` shape | **Accepted.** Name-keyed, fully-qualified value. |
| 4 | Version gate scope | **Accepted.** `@mantine/core` only; warn when a non-core `@mantine/*` range is unsatisfied. |
| 5 | Bare `registryDependencies` | **Accepted.** Parent-relative + `bare-dep-assumed-local` warning. Never fall back to ui.shadcn.com. |
| 6 | Framework tiers | **Accepted.** Tier A codemods for Vite / Next App / Next Pages / React Router; everything else Tier B. |
| 7 | Tailwind coexistence | **Accepted.** Report and do not patch when `@tailwindcss/postcss` is present. |

### The Node floor is `>=22.12`, not `>=20.12`

Resolution 1 was decided against a one-patch-release framing that turned out to be wrong twice over:

- **`commander@15` declares `engines.node: ">=22.12.0"`.** A `>=20.12` floor would have claimed
  support for a runtime our own dependency refuses.
- **Node 20 reached end-of-life 2026-04-30** (nodejs/Release schedule.json). The floor was being set
  on a line that was already dead; v22 is the oldest still receiving fixes, until 2027-04-30.

`process.loadEnvFile` (20.12) and `import.meta.dirname` (20.11) are both satisfied far below 22.12,
so the reasoning behind resolution 1 is untouched — only the number changed. The alternative,
holding commander at 14 (`>=20`, security-supported to 2027-05) to preserve a Node 20 floor, buys
compatibility with an EOL runtime and was rejected.

### The receipt is a v1 deliverable

Deferring it leaves the shipped bug open **between** invocations: `@base/empty-state` installed after
`@house/empty-state` is otherwise an ordinary "file exists, overwrite?" with no registry attribution and
no signal that a differently-typed component is about to replace another. The in-run collision check
(D8) closes this within one command only.

Consequences that bind every phase:

- The receipt is **read in `plan()`** and participates in gate evaluation, so its types belong in
  `src/plan/types.ts` and must be frozen with the rest of the contract — not bolted on at apply time.
- A destination whose receipt records a **different** owning item id is a cross-run collision. It is
  reported with both ids and both registries, and is subject to the same `resolutions` escape hatch
  as D8's in-run case.
- The overwrite prompt gains attribution: which item, from which registry, replacing which item.
- Writing the receipt is a phase of `apply()` and participates in the pre-image journal, so a failed
  run does not leave the receipt describing files that were rolled back.
- Every read path must still handle "no receipt yet" — that branch is unavoidable for existing
  projects, and shipping it in v1 is cheaper than retrofitting it later.
- At this checkpoint, `manteen diff` and `manteen update` remained deferred but were no longer
  blocked on format design. W5 subsequently shipped both commands, and D32–D38/Wu supersede their
  receipt and update semantics.

Rows in §6 for "Install receipt / `manteen.lock.json`" and the open question below are superseded.

---

## 5b. W6 contract decisions — approved 2026-07-29

The probe checkpoint in `w6-init-handoff.md` closed these choices before implementation:

| # | Decision |
|---|---|
| 1 | Generated config uses the documented live `@house` item and index URLs, so a fresh project can both fetch named items and run `list`; the current schema does not permit an empty registry map. |
| 2 | Init may make bounded `@/*` tsconfig and Vite `resolve.tsconfigPaths` patches; explicit conflicts refuse before mutation. |
| 3 | Theme lives at `<alias source root>/lib/theme.ts`, so every framework imports `@/lib/theme`. |
| 4 | Only structurally proven source seams are patched; dynamic or unsupported shapes refuse with instructions and are never replaced wholesale. |
| 5 | Init extends `DiagnosticCode`, `DIAGNOSTIC_CODES` and §1 rather than creating a second refusal system. |
| 6 | Codemods use a directly declared AST dependency when implementation imports it; a transitive `manteen-kit` dependency is not a contract. |
| 7 | The programmatic surface will export `planInit`/`applyInit` with every port factory needed to construct their arguments. |
| 8 | `--framework` accepts `vite`, `next-app`, `next-pages`, `next-hybrid`, `react-router`, `manual`; it resolves absent/ambiguous detection but cannot authorize a contradictory filesystem shape. |
| 9 | `@tailwindcss/postcss` remains byte-identical. The run emits a structured required instruction, reports `ok: true` / `complete: false`, and exits 0. Empty second-plan semantics apply to mutation entries, not repeated required instructions. |

The frozen type contract is separate from registry `Plan`: init files have no item id, wire type,
registry lineage or receipt ownership. `InitPlan.files` contains only create/update mutations with
absolute destinations, final UTF-8 text, final hashes and pre-image hashes. Apply re-verifies those
hashes, installs dependencies before writes, and writes every file through one shared pre-image
journal. Interactive apply has one all-or-nothing confirmation; cancellation exits 130 before the
install phase. Dry-run performs read-only preflight, prompts for nothing, and exits before install.

---

## 5. Historical open questions — closed

These were genuine forks in the original plan. They are retained because their rejected
alternatives explain the implementation, but they are not current questions: §5a and §5b record
their closure, and D32–D38 contain the later receipt/update overrides.

1. **Dotenv on the Node 20.11 floor.** `process.loadEnvFile` landed in 20.12, but shadcn's docs — which registry authors will link to — tell users to put `REGISTRY_TOKEN` in `.env.local`.
   *Options:* guarded `typeof process.loadEnvFile === "function"` call (silently no-ops on 20.11); hand-roll a ~20-line parser (correct on the whole floor, but a quoting/escaping bug surface that handles secrets); require exported env vars only; **raise the floor to >=20.12**.
   **Recommendation:** raise `engines.node` to `>=20.12` and call `process.loadEnvFile` unguarded. The floor is asserted-not-tested today anyway (local Node is v26), the 20.11→20.12 gap is one patch release, and it removes a guard whose failure mode is silent. `process.env` always wins over file values.

2. **Install receipt.** *(raised independently by apply and gates.)* Cross-**run** collisions were invisible at this checkpoint: `@base/empty-state` installed over `@house/empty-state` was an ordinary overwrite prompt with no registry attribution, reproducing the original bug across invocations. A receipt (item → registry → destination → content hash) also unlocked `manteen diff`/`manteen update`.
   **Historical recommendation:** defer to v1.1 and reserve `manteen.lock.json`. §5a rejected that recommendation and shipped a receipt in v1; D32 later replaced the legacy formats with receipt v3 and committed pristine bases.

3. **`resolutions` key shape.** *(config + resolver, merged.)* Flat map of bare item name → winning fully-qualified id, versus keying by resolved destination path (which is what actually collides, and would also catch two *differently*-named items whose targets coincide).
   **Recommendation:** name-keyed with a fully-qualified value (`{"empty-state": "@house/empty-state"}`). It reads the way users will guess and covers every case the fixtures and the real incident produce. Path-keyed is strictly more expressive and can be added as an accepted alternate value shape later without a breaking change.

4. **Version gate scope: `@mantine/core` only, or all `@mantine/*`?** The settled decision names core, and every fixture declares core — but the root catalog's `theme` item also depends on `@mantine/hooks@^9`, so a core-only gate passes while hooks sits on a mismatched major.
   **Recommendation:** core only in v1, and say so in the warning text when an item declares a non-core `@mantine/*` dependency whose range is not satisfied by what's installed. Widening the gate is a one-line change to the resolver but needs a decision about which package's `requires` a mismatch is attributed to.

5. **Bare `registryDependencies` entries.** The kit qualifies bare `uses` at build time, so parent-relative is exactly the authoring intent for anything kit-built. In shadcn semantics bare means the *public* shadcn registry, which is Tailwind-shaped.
   **Recommendation:** resolve parent-relative and emit `bare-dep-assumed-local` as a warning; never fall back to ui.shadcn.com. A hand-written non-kit registry that meant the public one gets a visible warning rather than a Tailwind component installed into a Mantine app.

6. **Astro and plain-React tiers, plus Gatsby/Redwood.** Mantine ships guides for Vite, Next, React Router, Gatsby, Redwood and vanilla JS — there is no `astro.mdx` and no `cra.mdx`. Astro additionally has no single place a provider could go, because islands run in isolated component contexts, so every island using Mantine needs its own provider.
   **Recommendation:** Phase 5 ships Tier A codemods for the four named targets. Everything else — Astro, plain React, Gatsby, Redwood — falls into one **Tier B** path that writes `mantine.json` + the theme scaffold and prints instructions, reachable by detection *or* by explicit `--framework`. Do not special-case Astro further until the open spike (does `<ColorSchemeScript />` server-rendered without a `client:` directive actually emit its inline script?) is run.

7. **Tailwind coexistence in `init`'s PostCSS patch.** `postcss-preset-mantine` bundles `postcss-nested` + `postcss-mixins`, and Mantine documents no position relative to `@tailwindcss/postcss`.
   **Recommendation:** when `@tailwindcss/postcss` is present in the config being patched, **report and do not patch** — print the exact block and let the user place it. Guessing an ordering that breaks a working Tailwind pipeline is worse than one manual step.

---

## 6. Historical deferrals and current status

This table began as the original scope ledger, not a permanent backlog. Unmarked rows remain
deferred; rows labeled **shipped** retain the old rationale while naming the decision or workflow
that replaced it.

| Originally deferred | Scoped by | Why not v1 / current status | Cost later |
|---|---|---|---|
| **Post-install re-gate** (re-read `@mantine/core` after `nypm` installs, before writing files) | gates | Re-litigates the settled "nothing touches disk until every check has passed" — an install *is* a disk write. D10's static pre-proof (`intersects` false ⇒ refuse; `subset` ⇒ silent; otherwise warn "verified after install") covers the greenfield case without it. | Low: one extra `resolveMantineInstall()` call between apply phases 2 and 3, gated on plan-time state ≠ `found`. Needs the settled decision amended first, and a `--force` semantics answer. |
| **Install receipt / `manteen.lock.json` — shipped; receipt v3 is current** | apply, gates | Originally deferred pending a persisted format. §5a moved the receipt into v1; D32 then established the current v3-only format and committed base sidecars. | No remaining implementation cost for the receipt itself. |
| **`manteen list` / `info` — shipped in W5** | resolver, gates | Originally deferred until the per-registry `index` URL could be fetched. W5 landed that inventory contract and both renderers. | No remaining implementation cost for these commands. |
| **`manteen search` — still deferred** | resolver, gates | The index/fetch prerequisite now exists, but the command is not assigned to a wave and whether it belongs in v1 remains undecided. | Low: search behavior plus a renderer over the existing inventory. |
| **Yarn PnP version resolution** | gates | The gate degrades to `undeterminable` with an explicit "Yarn PnP detected" message, so the user knows it's off rather than assuming it passed. | Medium: a PnP-aware resolver, or shelling out to `yarn info`. |
| **TS→JS transpilation for jsconfig-only projects** | config | Content ships verbatim; transpiling is a property change to the interchange format, not a feature. **Shipped, not deferred:** `plan()` refuses with `jsconfig-typescript-unsupported` (§1) when the project has only `jsconfig.json` and the item ships `.ts`/`.tsx` — including when `tsconfig` in `manteen.json` is pointed at a `jsconfig.json`, which does not count as a real tsconfig. What stays deferred is the transform itself: manteen still never rewrites `.ts`/`.tsx` into `.js`/`.jsx`, so the remedy is a real `tsconfig.json`, not this row. | High: a transform step that invalidates "we never rewrite content", which several other decisions rest on. |
| **`--prefer incoming` / `--strict-theme` on `manteen add`** | apply, testing | `prefer: "base"` is the only non-destructive setting for an installer; exposing the flip invites data loss the default-Yes confirm no longer covers. `--strict-theme` (promote conflicts to a refusal) is the kit's semantics, wrong for an installer where a conflict means "we kept your value". | Trivial: both are one flag threaded to `mergeThemeSource`/`ok`. Kit semantics are already tested in `merge-theme.test.ts`. |
| **Astro / Gatsby / Redwood / plain-React codemods** | init | See open question 6. | Medium each; Astro is high because there is no single provider mount point. |
| **`stylesApi` ↔ theme `classNames` cross-check** | gates | `@mantine/core` exports no selector metadata, so the comparison is against unverified registry declarations — a registry that under-declares produces warnings about the user's correct code. | Low mechanically, but only worth it if selector declarations prove reliable in practice. |
| **Negative `resolutions` form** (pin a name to "never from `@base`") | config | The positive form covers every collision the fixtures and the real incident produce. | Trivial: an alternate value shape on the same field. |
| **`defaultRegistry` for bare-name refs** (`manteen add empty-state`) | gates | v1 refuses an ambiguous bare name listing the qualified alternatives; the remedy is typing the namespace. Prompting would make one command mean different things on different machines and is impossible in CI. | Low: one config field plus a resolution step before `splitItemId`. |
| **Post-update verification — D40 shipped in source; formatting still deferred** | update orchestration | D40 adds opt-in project-owned package-script verification after a coherent update, with the exact boundary and completed local acceptance receipt in `update-verification-handoff.md`. It does not bundle a formatter or validator, run checks during `init`/`add`, or claim rollback for project-script side effects. Publication remains separate. | The verification implementation is complete; bundled formatting remains high-cost because it changes install weight and byte ownership. |
| **`manteen diff` / `manteen update` — shipped; Wu is current** | apply | Both were originally blocked on the install receipt. W5 shipped the commands; D32–D38 and Wu now define receipt-v3 diff and three-way update behavior. | No remaining implementation cost for the listed commands. |
| **Persisting the journal to disk** (surviving SIGKILL mid-write) | apply | The mutating window is a short in-memory write phase in a directory that is nearly always version-controlled. v1 documents the journal as best-effort convenience, not durability, and points at `git checkout -- <paths>` on rollback failure. | Low: write pre-images to `node_modules/.cache` before phase 3. |
| **`mantine-styles.d.ts` emission** | init | Present in `next-app-min-template` but in none of Mantine's guides; needed only under tsconfig settings that error on untyped CSS side-effect imports, which hasn't been checked. | Trivial once the triggering tsconfig setting is identified. |
