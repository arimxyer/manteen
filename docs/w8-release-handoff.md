# Wave 8 — release handoff

Status: **complete — both `0.1.1` packages are public through the tagged GitHub OIDC workflow and
carry npm provenance attestations.** Preparing a tarball, parsing a workflow or passing
`npm publish --dry-run` was deliberately not treated as publication evidence; the completion
receipt below records the hosted runs and independent registry observations.

## Scope and stopping condition

Wave 8 closes the distribution boundary. It stops only when all of the following are true:

1. `manteen-kit` and `manteen` have explicit repository metadata, a `0.1.0` changelog and an
   inspected, installable tarball containing the documented public surface.
2. The release workflow uses exact Node, npm and Bun versions that satisfy npm trusted publishing,
   disables the release cache, requests only `contents: read` and `id-token: write`, and contains no
   stored npm token seam.
3. A mechanical guard refuses a mismatched tag/version/package, a workspace dependency, incomplete
   publish metadata or a missing packaged file before `npm publish` is reachable.
4. Source checks, built-Node e2e and isolated packed-consumer rehearsals pass before publication.
5. The one-time manual `0.1.0` bootstrap is performed by the maintainer, kit first and client
   second, without putting npm credentials into an agent transcript.
6. Each existing package is bound to `arimxyer/manteen` / `release.yml` with `npm publish`
   permission through npm trusted publishing.
7. Tagged `0.1.1` releases publish both packages through GitHub-hosted OIDC, and the receipt records
   the workflow run, registry version and provenance result.

W8 does not add commands, registry items, stored tokens, staged publishing, platform promises or
new package-manager coverage. Registry content remains Wc.

## Frozen decisions

### Release versions

Keep the already-declared `0.1.0` first release. A `1.0.0` release would assert that the consumer
configuration and receipt formats have reached the long-term compatibility boundary; the project
has not made that promise. The kit changelog and the client's `manteen-kit@^0.1.0` dependency
already encode the `0.1` line.

npm requires a package to exist before a trusted publisher can be configured. Therefore:

- `0.1.0` is the one-time manual bootstrap and has no provenance attestation.
- `0.1.1` is the first tagged OIDC release. Its changelog will name the provenance transition even
  if no product behavior changes between the two versions.

This leaves the default install on a provenance-bearing release without publishing a disposable
or misleading bootstrap package version.

### Toolchain

- **Node `24.18.1`** — exact, already exercised by W7, and above npm's Node `22.14.0` OIDC floor.
- **npm `11.18.0`** — exact, above the `11.5.1` trusted-publish floor and the `11.15.0` `npm trust`
  floor. It predates the same-day npm `11.19.0` and npm `12.0.2` releases observed during this
  freeze, so W8 does not turn publication into a newest-major experiment.
- **Bun `1.3.14`** — the repository's frozen install/test runtime.

The authoritative requirements are npm's
[`trusted-publishers`](https://docs.npmjs.com/trusted-publishers/) and
[`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust/) documentation. GitHub-hosted
trusted publishing generates provenance automatically for public packages in a public repository;
the explicit package `publishConfig.provenance` remains as a fail-closed statement of intent.

### Publish order and authority boundary

The kit publishes first because `manteen@0.1.0` declares `manteen-kit@^0.1.0`. The client is not
published until that exact public dependency resolves from npm.

No agent runs `npm login`, reads an npm session, accepts a 2FA prompt or changes npm package
settings. Those are external maintainer actions. The manual bootstrap remained private. After the
maintainer configured both trusted publishers and explicitly authorized the release, the agent
pushed one reviewed tag at a time; the repository workflow, not a local npm session, performed
each trusted publish.

## Evidence and non-evidence

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| Static release guard | Package metadata and tag selection are internally consistent. | npm authentication or name ownership. |
| `npm pack` plus disposable install | The exact local tarballs contain and execute the expected public surface. | That npm accepted or served those bytes. |
| `npm publish --dry-run` | npm's local publication preparation accepts the package. | Registry authorization, OIDC exchange or publication. |
| Manual `0.1.0` registry query | The package name exists and kit-before-client resolution works. | Provenance; the bootstrap is intentionally manual. |
| Tagged `0.1.1` workflow plus npm receipt | OIDC publishing and provenance work for that exact package/version/run. | Future releases without rerunning the same guard. |

The public npm registry returned `E404` for both names on 2026-07-29 ET. That is an observation,
not a reservation; only the successful manual bootstrap claims each unscoped name.

## Local preparation receipt — 2026-07-29 ET

The release rehearsal used Bun `1.3.14`, Node `24.18.1` and npm `11.18.0`. It produced:

- 152 source tests passing with 501 assertions, followed by clean typecheck, lint and all four
  guards;
- 93 built-Node e2e tests passing, with the one packed-smoke case intentionally skipped because
  the isolated npm consumer owns that boundary;
- the real Linux pty prompt probe passing 3/3;
- an isolated npm consumer preparing, packing, installing and executing both packages from a
  temporary directory;
- clean tag-specific guards for `manteen-kit-v0.1.0` and `manteen-v0.1.0`, plus an intentional
  `manteen-v9.9.9` refusal; and
- clean `npm publish --dry-run --provenance=false --access public --json` preparation for both
  packages. npm still reports that publication requires login, as expected at the authority
  boundary.

The exact locally packed artifacts were:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `manteen-kit-0.1.0.tgz` | 14,852 bytes | `670cdfda3a91b4e6af9674375a92f6ff9833088a09413f091e69d36d072f2258` |
| `manteen-0.1.0.tgz` | 162,587 bytes | `ac67456b188e569f74833b07e79cdf466e9ed8696130488acc73d2aca3272e83` |

Two release-maintenance findings were repaired rather than suppressed:

1. Each package now carries its own MIT `LICENSE`; the client's changelog is also part of its
   explicit publish surface.
2. Both `bin` targets use npm's canonical `dist/cli.mjs` spelling. This removed npm's package
   normalization warning, and the release guard now refuses a regression to the non-canonical
   spelling.

This receipt proves the local source, built bundle and tarball boundaries. It does **not** prove npm
name ownership, authentication, registry availability, a GitHub OIDC exchange, publication or
provenance. Those boundaries were still pending at this checkpoint and are closed by the receipt
below.

## Trusted publication receipt — 2026-07-30 ET

The maintainer privately published both `0.1.0` bootstrap versions and configured npm trusted
publishers for `arimxyer/manteen` / `release.yml`. npm's registry timestamps show that the client
bootstrap became visible 22 seconds before the kit bootstrap, contrary to the planned order. That
created a brief interval in which the client's `manteen-kit@^0.1.0` dependency could not resolve;
both packages resolved before the trusted sequence began. The `0.1.1` sequence then enforced the
intended fail-stop order: kit publish and verification first, client tag second.

| Package | Merge and tag | Hosted verification | npm receipt |
| --- | --- | --- | --- |
| `manteen-kit@0.1.1` | PR [#6](https://github.com/arimxyer/manteen/pull/6), commit `d9608c6f875ef32294f793975733f506ac3f88ef`, tag `manteen-kit-v0.1.1` | CI [30513827499](https://github.com/arimxyer/manteen/actions/runs/30513827499); release [30514035486](https://github.com/arimxyer/manteen/actions/runs/30514035486) | Published `2026-07-30T04:31:20.096Z`; SHA-1 `42cb687e2571227fc4361eb4260cbd35f4cbb9b4`; integrity `sha512-UUvdDiQ4dC3VdqJmdVScIkRRh5Wfldu7sF/pyWXsYrc+u9WodNmA7U72D9TqoKtgaKY0d1mudoOkc1WecI8AQQ==` |
| `manteen@0.1.1` | PR [#7](https://github.com/arimxyer/manteen/pull/7), commit `b3006bc25c201accb9705ef981235068a7a95bb0`, tag `manteen-v0.1.1` | CI [30514210692](https://github.com/arimxyer/manteen/actions/runs/30514210692); release [30514369692](https://github.com/arimxyer/manteen/actions/runs/30514369692) | Published `2026-07-30T04:38:43.499Z`; SHA-1 `e8f08ab67b1b7890688114fd469172a6928f1440`; integrity `sha512-QhR2JgM+CPO2+gqVur+WqPUy4ktWcDnYnh624eQpD5C1UzUYPt9Zw/rOMNZU/JaQORxpCA4YxAK2TY7BIBzzvA==` |

Each release log records `npm publish --provenance --access public`, a signed provenance statement
with GitHub Actions source/build information and a successful package/version result. Independent
npm metadata reported `0.1.1` as `latest` and exposed two Sigstore attestations per package: npm's
publish predicate and SLSA provenance v1. Clean temporary consumers then fetched the public
packages: `manteen-kit --help` printed its command surface, and `manteen --version` printed `0.1.1`.

This closes W8's publication boundary for these exact versions and runs. It does not prove that a
future tag will publish; every future release must rerun the tag guard, hosted checks and registry
verification.

## Execution sequence

### A. Repository preparation — agent-owned

1. Add the client's exact GitHub repository metadata, homepage, bugs URL, `publishConfig` and
   packaged changelog.
2. Pin the release runtime and disable automatic package-manager caching.
3. Add a release guard and run it for both `0.1.0` tags.
4. Build and inspect both tarballs under exact Node/npm/Bun.
5. Install the two tarballs into disposable consumers and run the shipped binaries.
6. Merge the green preparation PR before any npm action.

### B. Manual bootstrap — maintainer-owned, private terminal

The package manifests deliberately request provenance, so the manual bootstrap overrides it rather
than pretending a local publish has an OIDC attestation:

```bash
npm login
cd packages/registry-kit
npm publish --access public --provenance=false

cd ../cli
npm publish --access public --provenance=false
```

Do not publish the client unless `npm view manteen-kit@0.1.0 version` returns `0.1.0` first.

Then, with npm `11.18.0` or newer and 2FA enabled, configure the exact publisher through npmjs.com
or from the maintainer's authenticated terminal:

```bash
npm trust github manteen-kit --file release.yml --repo arimxyer/manteen --allow-publish --yes
npm trust github manteen --file release.yml --repo arimxyer/manteen --allow-publish --yes
```

The workflow filename is only `release.yml`, not `.github/workflows/release.yml`; npm matches it
case-sensitively. Each package allows `npm publish`, not staged publishing.

### C. Trusted release — agent prepares, maintainer authorizes tags

After both trust relationships exist:

1. Bump and document `manteen-kit@0.1.1`; merge; tag `manteen-kit-v0.1.1`.
2. Verify the kit workflow and npm provenance receipt.
3. Bump and document `manteen@0.1.1`; merge; tag `manteen-v0.1.1`.
4. Verify the client workflow, dependency resolution and npm provenance receipt.

Tags are pushed one at a time. A failed kit release stops the sequence before the client tag.
