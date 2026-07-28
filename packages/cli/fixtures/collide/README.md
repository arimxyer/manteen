# `@collide` — the second registry

A one-item catalog that publishes `empty-state`, the same name
`packages/registry-kit/fixtures/base` publishes. Compiled by the e2e tier with
the kit's `compileRegistry` + `writeRegistry`, served over `file://`, and used to
prove that `manteen add @base/empty-state @collide/empty-state` refuses with
`target-collision` rather than letting one silently overwrite the other.

`src/empty-state.tsx` is deliberately prop-incompatible with `@base`'s — see the
comment in that file.

It lives in `fixtures/`, not `test/`, because the root `tsconfig.json` includes
`packages/*/test/**/*`. A `.tsx` file under `test/` would be typechecked against
this repo's own compiler options and would need `@tabler/icons-react` and a JSX
runtime resolvable from here, neither of which has anything to do with what the
fixture is for.
