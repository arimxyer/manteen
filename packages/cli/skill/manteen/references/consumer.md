# Consumer workflow

## Resolve the installed command

Use the package manager declared by the project. These forms use the local package and refuse or
fail when it is absent rather than silently downloading a newer CLI:

```bash
npm exec --yes=false -- manteen --version
pnpm exec manteen --version
yarn manteen --version
bunx --no-install manteen --version
```

The rest of this guide spells that resolved command as `manteen`. Keep stderr separate from JSON
stdout; package-manager notices are not part of Manteen's machine document.

## Establish state

Run from the application root, or pass `--cwd <dir>` explicitly.

```bash
manteen --version
manteen status --json
```

`status` is offline. A successful assessment can have `healthy: false`; that means the project is
inspectable but needs work. If the installed CLI has no `status`, inspect `manteen.json`,
`manteen.lock.json`, `.manteen/bases/`, and the relevant command help without modifying them.

`healthy: true` covers Manteen's local configuration and ownership state only. It does not run the
application's typecheck, tests, or production build. Inspect whether verification is configured,
then run the project's required checks explicitly when the task needs application-level proof.

Do not fetch registry data merely to answer whether local initialization or receipt state is
healthy.

## Discover before installing

```bash
manteen list --json
manteen list @house --query table --type registry:block --json
manteen info @house/data-table --json
```

With no query, list keeps deterministic registry and canonical item order. A query ranks matches
within each registry by exact canonical id, exact name, exact title, title prefix, id/name
substring, title substring, then description substring; equal ranks retain prior order. JSON rows
explain the result through `queryMatches` and `queryRank`.

Use configured namespaces for repeatable work. A direct item URL is suitable for one
self-contained item, but cannot safely resolve its bare parent-local dependencies.

Manage a namespace through reviewed config plans when the installed CLI exposes them:

```bash
manteen registry list --json
manteen registry add @workshop --url 'http://127.0.0.1:4174/{name}.json' \
  --index http://127.0.0.1:4174/registry.json --dry-run --json
```

Use the returned top-level rerun action to apply. Replacement is explicit, and removal refuses a
namespace still referenced by receipt items. Header values must remain literal `${VAR}` templates;
never pass an expanded secret.

`info --json` is the detail surface. Read its full docs, props, usage, dependency, provider,
Mantine-version, theme, Styles API, and file metadata before deciding whether an item fits.

## Initialize or add

Preview first:

```bash
manteen init --dry-run --json
manteen add @house/data-table --dry-run --json
```

If preview refuses because a destination needs a decision, choose deliberately:

- `--overwrite` authorizes replacement of existing add destinations.
- `--no-overwrite` preserves them.
- `--yes` is non-interactive consent and implies overwrite unless `--no-overwrite` was explicit.
- `--force` clears only diagnostics documented as forceable; it is not an overwrite flag.

When preview includes `planDigest`, retain the exact root, refs, options, and digest. Apply only the
same reviewed plan:

```bash
manteen add @house/data-table --overwrite --expect-plan <sha256> --json
```

A digest mismatch is a non-forceable, zero-write refusal. Re-preview instead of weakening it.

## Distinguish installation from integration

`manteen add` installs registry-managed source and ownership state. It does not prove that an
application route imports, renders, or otherwise uses the item.

If the request asks only to install an item, verify the add outcome and stop without inventing an
application placement. If it asks to use, show, or wire the item into the application:

1. Read `manteen info <ref> --json` for usage, props, provider, and dependency requirements.
2. Edit the appropriate consumer-owned application file to import and use the installed item. Do
   not alter registry-managed source merely to connect it to the application.
3. Run the project's required typecheck, tests, or build; `manteen status` is not application proof.
4. Report registry installation and application integration as separate facts.

## Preserve local adaptations during maintenance

```bash
manteen diff --json
manteen update @house/data-table --dry-run --json
manteen update @house/data-table --expect-plan <sha256> --json
```

The ordinary update is a three-way merge: pristine installed base, local candidate, and current
upstream. The apply command repeats the reviewed ref and mutation options, omits `--dry-run`, and
adds the returned digest through `--expect-plan`. Review conflicts and verification definitions
before applying. Use `--take-upstream` only when discarding local adaptations is the intended
result.

Configured verification runs inside the mutation transaction. Do not add `--no-verify` merely to
make a failure disappear; first decide whether the configured check is inapplicable to this run.

Use `manteen verification show --json` to compare configured checks with discovered package
scripts. `verification set` stores repeated operation-specific script names and `verification
clear --operation <name|all>` removes them; both mutations require a reviewed plan.

Files omitted upstream are retained until exact removal:

```bash
manteen remove --upstream-removed --dry-run --json
manteen remove --upstream-removed --file src/components/ui/old.tsx --dry-run --json
```

Apply the exact path returned by discovery. `--discard-adapted` authorizes deletion only for named
files whose local bytes differ from pristine upstream. Removal does not imply uninstalling an
item, dependency, theme contribution, or package style.

## Install this skill

Use `manteen agent guide --json` for the packaged guide when the installed CLI provides it.

```bash
manteen agent install --dry-run --json
manteen agent install --json
```

The default project target is `.agents/skills/manteen`. Use an explicit target for universal-user,
Codex-user, Claude-project, Claude-user, or a custom destination. Existing unowned or locally
modified skills are preserved. `--update` updates an owned installation; `--take-packaged` is the
explicit choice to discard its local adaptation.

Manteen never installs a skill or edits `AGENTS.md` as a side effect of `init`.
