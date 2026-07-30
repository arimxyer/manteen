#!/usr/bin/env node
/**
 * Fail closed on release drift before a tag can reach `npm publish`.
 *
 * Package publication is the least recoverable write in this repository: npm
 * never lets a version number be reused. The source tests prove behavior, but
 * they do not prove that a manifest names the right repository, includes its
 * license/changelog, contains no workspace protocol or agrees with the tag.
 * Those are mechanical release facts, so they belong in a guard rather than a
 * checklist.
 *
 * With no arguments this is a fast static check and belongs in ordinary CI.
 * `--tag <tag>` additionally selects exactly one package, binds the tag to its
 * manifest version and inspects `npm pack --dry-run` output after the packages
 * have been built. It never creates a tarball or contacts the publish endpoint.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const REPOSITORY_URL = "git+https://github.com/arimxyer/manteen.git";
const BUGS_URL = "https://github.com/arimxyer/manteen/issues";
const RELEASE_WORKFLOW = join(REPO_ROOT, ".github/workflows/release.yml");

const PACKAGES = [
  {
    name: "manteen-kit",
    dir: "packages/registry-kit",
    tagPrefix: "manteen-kit-v",
    homepage: "https://github.com/arimxyer/manteen/tree/main/packages/registry-kit#readme",
    packedFiles: [
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "dist/cli.mjs",
      "dist/index.d.mts",
      "dist/index.mjs",
      "package.json",
      "schema/manteen.registry.schema.json",
      "schema/wire/registry-item.schema.json",
    ],
  },
  {
    name: "manteen",
    dir: "packages/cli",
    tagPrefix: "manteen-v",
    homepage: "https://github.com/arimxyer/manteen/tree/main/packages/cli#readme",
    packedFiles: [
      "CHANGELOG.md",
      "LICENSE",
      "README.md",
      "dist/cli.mjs",
      "dist/index.d.mts",
      "dist/index.mjs",
      "package.json",
      "schema/manteen-item-meta.schema.json",
      "schema/manteen.lock.schema.json",
      "schema/manteen.schema.json",
    ],
  },
];

const failures = [];
const rootLicense = readFileSync(join(REPO_ROOT, "LICENSE"), "utf8");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    failures.push(`${path}: not readable JSON (${String(error)})`);
    return null;
  }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function findWorkspaceProtocol(value, path = "package.json") {
  if (typeof value === "string") return value.startsWith("workspace:") ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findWorkspaceProtocol(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    findWorkspaceProtocol(entry, `${path}.${key}`),
  );
}

function inspectManifest(spec) {
  const packageRoot = join(REPO_ROOT, spec.dir);
  const manifestPath = join(packageRoot, "package.json");
  const manifest = readJson(manifestPath);
  if (!manifest) return null;

  expect(manifest.name === spec.name, `${spec.dir}: expected package name ${spec.name}`);
  expect(
    /^0\.\d+\.\d+$/.test(manifest.version),
    `${spec.name}: version must stay on an explicit 0.x release`,
  );
  expect(manifest.private !== true, `${spec.name}: a published package cannot be private`);
  expect(manifest.license === "MIT", `${spec.name}: license must be MIT`);
  expect(
    JSON.stringify(manifest.repository) ===
      JSON.stringify({ type: "git", url: REPOSITORY_URL, directory: spec.dir }),
    `${spec.name}: repository must exactly identify arimxyer/manteen and ${spec.dir}`,
  );
  expect(
    manifest.homepage === spec.homepage,
    `${spec.name}: homepage does not match its package directory`,
  );
  expect(
    manifest.bugs?.url === BUGS_URL,
    `${spec.name}: bugs URL must point at the repository issues`,
  );
  expect(
    manifest.publishConfig?.access === "public",
    `${spec.name}: publishConfig.access must be public`,
  );
  expect(
    manifest.publishConfig?.provenance === true,
    `${spec.name}: publishConfig.provenance must be true`,
  );
  expect(
    manifest.bin?.[spec.name] === "dist/cli.mjs",
    `${spec.name}: bin must use npm's canonical dist/cli.mjs spelling`,
  );

  for (const required of ["dist", "schema", "README.md", "CHANGELOG.md", "LICENSE"]) {
    expect(manifest.files?.includes(required), `${spec.name}: files must include ${required}`);
  }

  const changelog = readFileSync(join(packageRoot, "CHANGELOG.md"), "utf8");
  expect(
    changelog.includes(`\n## ${manifest.version}\n`),
    `${spec.name}: changelog has no ${manifest.version} section`,
  );
  const packageLicense = readFileSync(join(packageRoot, "LICENSE"), "utf8");
  expect(
    packageLicense === rootLicense,
    `${spec.name}: packaged LICENSE differs from the repository MIT license`,
  );

  for (const location of findWorkspaceProtocol(manifest)) {
    failures.push(`${spec.name}: ${location} contains a workspace: protocol`);
  }

  return { ...spec, manifest, packageRoot };
}

function inspectWorkflow() {
  const source = readFileSync(RELEASE_WORKFLOW, "utf8");
  const required = [
    "actions/checkout@v7",
    "actions/setup-node@v7",
    "oven-sh/setup-bun@v2",
    'node-version: "24.18.1"',
    'bun-version: "1.3.14"',
    "package-manager-cache: false",
    "npm install --global npm@11.18.0",
    'node scripts/guard-release.mjs --tag "$GITHUB_REF_NAME"',
    "node packages/cli/scripts/run-e2e.mjs",
    "npm publish --provenance --access public",
    "contents: read",
    "id-token: write",
  ];
  for (const text of required) {
    expect(source.includes(text), `release.yml: missing ${JSON.stringify(text)}`);
  }
  expect(
    !/^\s*(?:NODE_AUTH_TOKEN|NPM_TOKEN):/m.test(source),
    "release.yml: stored npm token environment seam is forbidden",
  );
  expect(
    !/\$\{\{\s*secrets\./.test(source),
    "release.yml: release job must not read GitHub Actions secrets",
  );
}

function npmPackRecord(spec) {
  const run = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: spec.packageRoot,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    failures.push(
      `${spec.name}: npm pack --dry-run failed (${run.stderr.trim() || `status ${run.status}`})`,
    );
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch (error) {
    failures.push(`${spec.name}: npm pack did not emit parseable JSON (${String(error)})`);
    return null;
  }

  if (Array.isArray(parsed)) return parsed[0] ?? null;
  if (parsed?.[spec.name]) return parsed[spec.name];
  if (parsed?.name === spec.name) return parsed;
  failures.push(`${spec.name}: npm pack JSON contains no record for the selected package`);
  return null;
}

function inspectPackedFiles(spec) {
  const packed = npmPackRecord(spec);
  if (!packed) return;
  expect(packed.name === spec.name, `${spec.name}: packed name is ${String(packed.name)}`);
  expect(
    packed.version === spec.manifest.version,
    `${spec.name}: packed version differs from package.json`,
  );

  const entries = new Map((packed.files ?? []).map((file) => [file.path, file]));
  for (const path of spec.packedFiles) {
    const entry = entries.get(path);
    expect(Boolean(entry), `${spec.name}: packed tarball is missing ${path}`);
    if (entry) expect(entry.size > 0, `${spec.name}: packed ${path} is empty`);
  }

  const bin = spec.manifest.bin?.[spec.name]?.replace(/^\.\//, "");
  const binEntry = entries.get(bin);
  expect(Boolean(binEntry), `${spec.name}: packed tarball is missing bin target ${String(bin)}`);
  if (binEntry)
    expect((binEntry.mode & 0o111) !== 0, `${spec.name}: packed bin target is not executable`);
}

function requestedTag() {
  const index = process.argv.indexOf("--tag");
  if (index === -1) return null;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    console.error("guard-release: --tag requires the complete git tag");
    process.exit(2);
  }
  return process.argv[index + 1];
}

const manifests = PACKAGES.map(inspectManifest).filter(Boolean);
const client = manifests.find((entry) => entry.name === "manteen");
expect(
  client?.manifest.dependencies?.["manteen-kit"] === "^0.1.0",
  "manteen: dependency must remain publishable manteen-kit@^0.1.0",
);
inspectWorkflow();

const tag = requestedTag();
if (tag) {
  const selected = manifests.filter((entry) => tag.startsWith(entry.tagPrefix));
  expect(selected.length === 1, `tag ${tag} must select exactly one release package`);
  if (selected.length === 1) {
    const [spec] = selected;
    expect(
      tag === `${spec.tagPrefix}${spec.manifest.version}`,
      `tag ${tag} does not match ${spec.name}@${spec.manifest.version}`,
    );
    inspectPackedFiles(spec);
  }
}

if (failures.length > 0) {
  console.error(`guard-release: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `guard-release: clean — ${manifests.length} publishable manifests${tag ? `; ${tag} matches its inspected packed surface` : ""}.`,
);
