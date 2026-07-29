# manteen — the client

Installs registry items into someone else's project and keeps them current. Node ESM only,
`engines.node >= 22.12`, bundled flat into `dist/` by tsdown.

## The shape

```
cli/index.ts      commander wiring. Owns exit codes and is the ONLY place that
                  reads process.argv or writes to process.stdout/stderr.
   ↓
commands/*.ts     add is in cli/index.ts; list, info, diff, update live here.
                  Each is a pure core plus a `run*` shell. Only the core is exported.
   ↓
plan/             Reads. Decides. Never writes. → see plan/CLAUDE.md
   ↓
apply/            Writes, in six ordered phases. → see apply/CLAUDE.md
```

Supporting: `config/` (manteen.json, aliases, tsconfig paths, `${VAR}` expansion),
`gates/` (the eight refusal checks plan calls), `inventory/` (installed + available readers),
`receipt/` (manteen.lock.json), `fs/walk.ts`.

## Conventions worth knowing before you edit

**`src/index.ts` is the programmatic API and importing it must do nothing.** No argv, no stdout,
no cwd resolution. That is why the `run*` shells are not exported.

**Every exported core ships the port factories its arguments need.** A function whose argument
type can only be constructed by a module the package does not expose is not public API however
exported it looks, and typecheck will not tell you. This was a real defect found in W5.

**Diagnostics are data, not strings.** `plan/diagnostics.ts` holds `DIAGNOSTIC_CODES`, a
`Record<DiagnosticCode, DiagnosticSpec>` — so adding a union member without a row is a compile
error, and `scripts/guard-diagnostics.mjs` fails if a code has no emitter. Currently 34/34, 0
pending. Never add a code without an emitter and a test.

**Interactivity changes exactly one behaviour**, `destination-exists`: a terminal gets a prompt,
CI gets an error naming `--overwrite` / `--no-overwrite`. `add` and `update` are the only two
commands that can reach it — `diff` passes `overwrite: true` on purpose, and `list`/`info` never
plan a write. Both carry a shared `NON-INTERACTIVE` help block. `init` will need it too.

**`isInteractive` is `isTTY && !isCI() && !--yes`, and clack's `isCI` tests `CI === "true"`
exactly.** `CI=1` is falsy to it, so a harness setting `CI=1` takes the interactive branch and
blocks forever on a prompt. Tests must use `CI=true`. (D14.)

## Tests

| Tier | Runs | Command |
| --- | --- | --- |
| unit | bun, source | `bun test` — 84 |
| e2e | **node, built `dist/`** | `node --test packages/cli/e2e/*.node-e2e.mjs` — 82 |

`e2e/helpers/child-env.mjs` owns every child process's environment. Use it rather than spreading
`process.env` inline: an inherited `FORCE_COLOR` makes node warn onto stderr, which breaks every
assertion that requires stderr to be exactly the CLI's output — and it breaks it *locally only*,
since CI sets no such variable.

What the e2e tier deliberately does **not** cover is stated in `apply-surface.node-e2e.mjs`'s
header, so it is not mistaken for coverage. Read that before assuming the prompt widget is tested.
