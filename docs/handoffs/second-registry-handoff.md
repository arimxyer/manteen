# Second live registry handoff

[Documentation map](../project-context.md) · [Implementation handoffs](README.md)

Status: **complete — public `manteen@0.2.0` consumed one independently hosted, hand-authored
registry under two different project-selected namespaces.**

## Question and stopping condition

Does `manteen` consume the supported interchange contract, or does it only appear to work because
its tests and live content come from the same `manteen-kit` compiler and `@house` registry?

This proof stops when a second registry:

1. lives in a separate public repository and Pages deployment;
2. authors wire item and index JSON directly, without `manteen.registry.json` or a compile step;
3. publishes a shape the kit itself cannot emit;
4. passes `list`, `info`, `add`, production build, `update` and `diff` through the public CLI;
5. works under two different namespaces chosen only by the consuming projects; and
6. leaves receipts pointing only at the independent HTTPS source.

## Independence boundary

The source is the public
[`arimxyer/manteen-interop-registry`](https://github.com/arimxyer/manteen-interop-registry)
repository. Its item documents under `public/r/` are the authored source of truth. It has no
Manteen authoring catalog and does not call `compileRegistry()` or `writeRegistry()`.
`manteen-kit@0.2.0` is a development dependency only so the repository can validate those direct
documents against the same vendored interchange schema the client reads.

The two-item graph deliberately covers shapes outside the kit's emitted output:

- `primitives/status-chip` and `blocks/release-panel` use nested names. The client preserves the
  portion after the first namespace slash, while the current kit writer cannot create nested
  output directories.
- `blocks/release-panel` declares bare `registryDependencies: ["primitives/status-chip"]`.
  A hand-authored registry cannot know which namespace a consumer will assign it. Manteen resolves
  that dependency against the declaring item's namespace and emits the visible
  `bare-dep-assumed-local` warning.

The block also exercises a `registry:block` file, a targeted CSS module, `@mantine/core@^9`,
`@tabler/icons-react@^3`, provider/version metadata and a transitive `registry:ui` file.

## Hosted receipt — 2026-07-30 ET / 2026-07-31 UTC

The initial repository commit is `e26407bbd084cc4c4c27637eb088dd3ddef853dc`; hosted validation
[30600594532](https://github.com/arimxyer/manteen-interop-registry/actions/runs/30600594532)
passed.

The first deployment
[30600621089](https://github.com/arimxyer/manteen-interop-registry/actions/runs/30600621089)
succeeded but exposed a maintenance annotation: `actions/configure-pages@v5` still targeted
Node 20 and GitHub force-ran it on Node 24. The notice was repaired rather than ignored.
[PR #1](https://github.com/arimxyer/manteen-interop-registry/pull/1) upgraded the action to v6,
whose `action.yml` declares Node 24. The merge commit is
`d9e26a5412f0ae337a9d14eafe8b32c2530eb30a`; hosted validation
[30600712574](https://github.com/arimxyer/manteen-interop-registry/actions/runs/30600712574)
passed, and replacement Pages deployment
[30600726922](https://github.com/arimxyer/manteen-interop-registry/actions/runs/30600726922)
completed with zero annotations.

All live documents returned HTTP 200 with `application/json; charset=utf-8`, and their served bytes
matched the repository:

| Artifact | SHA-256 |
| --- | --- |
| [`registry.json`](https://arimxyer.github.io/manteen-interop-registry/r/registry.json) | `a3326e4acdb91bdd316753e495cc4882335908efee7d86e3a72445456c641497` |
| [`primitives/status-chip.json`](https://arimxyer.github.io/manteen-interop-registry/r/primitives/status-chip.json) | `86c68e35fe40180151e6461408cb6299c21014c21f647850c7f6eed789a9de71` |
| [`blocks/release-panel.json`](https://arimxyer.github.io/manteen-interop-registry/r/blocks/release-panel.json) | `44273a2780a0f3c01555066cbcf2745ce9022d57fa232f144c176c251be2edf8` |

## Public consumer receipt

Two separate fresh Vite React TypeScript projects installed `manteen@0.2.0` from npm. Both retained
the default `@house` entry and added the same independent URLs, but one named them `@alpha` and the
other `@vendor`.

Each consumer then ran:

```bash
manteen list <namespace>
manteen info <namespace>/blocks/release-panel
manteen add <namespace>/blocks/release-panel --yes --pm npm
npm run build
manteen update <namespace>/blocks/release-panel --yes --pm npm
manteen diff --stat
```

For `@alpha`, the visible compatibility warning resolved
`primitives/status-chip -> @alpha/primitives/status-chip`; for `@vendor`, the same served bytes
resolved it to `@vendor/primitives/status-chip`. Each install wrote the UI primitive, block and CSS
module, installed Tabler icons, transformed 7,003 modules in the production build, reported the
root up to date on `update`, and ended with `No changes. 3 files unchanged.`

Receipt v2 contained exactly the two namespace-specific item ids and source URLs beginning
`https://arimxyer.github.io/manteen-interop-registry/`. No item was attributed to `@house`, and no
local checkout or `file:` registry participated.

## Evidence and non-evidence

This proves that the released CLI's supported item/index subset is not coupled to the `@house`
catalog, the Manteen authoring compiler, a fixed namespace, flat item names or a local fixture
server. It also proves that discovery and maintenance commands use the same independent source as
installation.

It does not claim that Manteen implements every field in the broader shadcn schema; refused and
degraded fields remain governed by the client build plan. The registry is maintained by the same
GitHub account and hosted on the same Pages provider, so this is not independent-operator,
cross-provider, authenticated-registry or third-party-client proof. Those are separate questions,
not hidden inside this stopping condition.

## Next boundary

The registry-agnostic question is closed for Manteen's declared interchange subset. Wc can return
to small attributed content tranches and broader framework-specific visual acceptance. If product
usage later requires it, private/authenticated or independently operated registries should be
probed as their own explicit milestones.
