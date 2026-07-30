# Wave 8 — release handoff

Status: **contract frozen; repository preparation in progress.** Wave 8 is not complete until both
packages have a real trusted-publisher release receipt. Preparing a tarball, parsing a workflow or
passing `npm publish --dry-run` is deliberately not described as publication evidence.

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

No agent runs `npm login`, reads an npm session, accepts a 2FA prompt, publishes a package or
changes npm package settings. Those are external maintainer actions. The repository work proceeds
through dry runs and stops with exact commands plus tarball hashes at that boundary.

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
