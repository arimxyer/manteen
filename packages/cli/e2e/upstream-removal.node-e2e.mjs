/**
 * D42 upstream-file removal, end to end under real Node against the built CLI.
 *
 * The registry and every consumer byte live in a disposable directory. The
 * controlled registry advances from an installed revision to one that omits
 * ordinary files, so this tier proves the shipped command/receipt/journal seam
 * without writing a probe into this repository's node_modules.
 *
 * Run it with:
 *   bun --cwd=packages/cli run build
 *   node --test packages/cli/e2e/upstream-removal.node-e2e.mjs
 */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

import { childEnv } from "./helpers/child-env.mjs";

const PKG_ROOT = resolve(import.meta.dirname, "..");
const CLI = join(PKG_ROOT, "dist", "cli.mjs");

assert.equal(
  process.versions.bun,
  undefined,
  "the e2e tier must run under node, not bun — use `node --test packages/cli/e2e/*.node-e2e.mjs`",
);
assert.ok(existsSync(CLI), `${CLI} is missing. Run \`bun --cwd=packages/cli run build\` first.`);

const WORK = realpathSync(mkdtempSync(join(tmpdir(), "manteen-upstream-removal-")));
after(() => rmSync(WORK, { recursive: true, force: true }));

const OWNER = "@proof/owner";
const WITNESS = "@proof/witness";
const CRLF_DESTINATION = "src/components/ui/old-crlf.tsx";
const ADAPTED_DESTINATION = "src/components/ui/adapted.tsx";
const MISSING_DESTINATION = "src/components/ui/missing.tsx";
const WITNESS_DESTINATION = "src/components/ui/witness.tsx";

const CRLF_SOURCE = "export const oldCrlf = true;\r\nexport const preservedLineEnding = true;\r\n";
const ADAPTED_SOURCE = "export const adapted = 'upstream';\n";
const MISSING_SOURCE = "export const missing = 'upstream';\n";
const WITNESS_SOURCE = "export const witness = 'unrelated';\n";

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

const ALIASES = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};

function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

function wireFile(name, content) {
  return {
    path: `registry/ui/${name}`,
    type: "registry:ui",
    content,
  };
}

function writeItem(registry, name, files) {
  write(
    join(registry, `${name}.json`),
    `${JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        name,
        type: "registry:ui",
        files,
      },
      null,
      2,
    )}\n`,
  );
}

function writeOldRevision(registry) {
  writeItem(registry, "owner", [
    wireFile("old-crlf.tsx", CRLF_SOURCE),
    wireFile("adapted.tsx", ADAPTED_SOURCE),
    wireFile("missing.tsx", MISSING_SOURCE),
  ]);
  writeItem(registry, "witness", [wireFile("witness.tsx", WITNESS_SOURCE)]);
}

function writeCurrentOwner(registry) {
  writeItem(registry, "owner", []);
}

function writeCurrentWitness(registry, { reassignCrlf = false } = {}) {
  writeItem(registry, "witness", [
    wireFile("witness.tsx", WITNESS_SOURCE),
    ...(reassignCrlf ? [wireFile("old-crlf.tsx", "export const reassigned = true;\n")] : []),
  ]);
}

function makeProject(name) {
  const candidate = join(WORK, name);
  mkdirSync(candidate, { recursive: true });
  const root = realpathSync(candidate);
  const registry = join(root, "registry");
  mkdirSync(registry, { recursive: true });
  writeOldRevision(registry);

  write(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: `upstream-removal-${name}`,
        version: "0.0.0",
        private: true,
        type: "module",
        packageManager: "npm@10.9.2",
      },
      null,
      2,
    )}\n`,
  );
  write(join(root, "tsconfig.json"), `${JSON.stringify(TSCONFIG, null, 2)}\n`);

  const registryBase = pathToFileURL(registry).href;
  write(
    join(root, "manteen.json"),
    `${JSON.stringify(
      {
        registries: { "@proof": `${registryBase}/{name}.json` },
        aliases: ALIASES,
      },
      null,
      2,
    )}\n`,
  );
  return { root, registry };
}

function run(root, args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: root,
    encoding: "utf8",
    env: childEnv(),
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    get all() {
      return `${this.stdout}${this.stderr}`;
    },
  };
}

function json(result) {
  assert.notEqual(result.status, 2, `usage/config failure, not a JSON result: ${result.all}`);
  assert.equal(result.stderr, "", `--json must keep stderr empty: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function absolute(root, receiptPath) {
  return join(root, ...receiptPath.split("/"));
}

function basePath(root, receiptPath) {
  const segments = receiptPath.split("/");
  const filename = segments.pop();
  assert.ok(filename);
  return join(root, ".manteen", "bases", ...segments, `${filename}.base`);
}

function receipt(root) {
  return JSON.parse(readFileSync(join(root, "manteen.lock.json"), "utf8"));
}

function removal(root, args = []) {
  return run(root, ["remove", "--upstream-removed", ...args]);
}

function snapshotManaged(root) {
  const paths = [
    "manteen.lock.json",
    CRLF_DESTINATION,
    ADAPTED_DESTINATION,
    MISSING_DESTINATION,
    WITNESS_DESTINATION,
  ];
  return Object.fromEntries(
    paths.flatMap((path) => {
      const source = absolute(root, path);
      const base = path === "manteen.lock.json" ? null : basePath(root, path);
      return [
        [path, existsSync(source) ? readFileSync(source).toString("base64") : null],
        ...(base === null
          ? []
          : [
              [
                `.manteen/bases/${path}.base`,
                existsSync(base) ? readFileSync(base).toString("base64") : null,
              ],
            ]),
      ];
    }),
  );
}

function candidateOf(document, destination) {
  const candidate = document.candidates.find((entry) => entry.destination === destination);
  assert.ok(candidate, `missing candidate ${destination}: ${JSON.stringify(document, null, 2)}`);
  return candidate;
}

function removalOf(document, destination) {
  const committed = document.removals.find((entry) => entry.destination === destination);
  assert.ok(committed, `missing removal ${destination}: ${JSON.stringify(document, null, 2)}`);
  return committed;
}

test("remove help and semantic usage expose only the explicit pruning surface", () => {
  const { root } = makeProject("usage");

  const rootHelp = run(root, ["--help"]);
  assert.equal(rootHelp.status, 0, rootHelp.all);
  assert.match(rootHelp.stdout, /^\s+remove\b/m, rootHelp.stdout);

  const help = run(root, ["remove", "--help"]);
  assert.equal(help.status, 0, help.all);
  assert.match(help.stdout, /^Usage: .* remove \[options\]$/m, help.stdout);
  for (const flag of ["--upstream-removed", "--file", "--discard-adapted", "--dry-run", "--json"]) {
    assert.match(help.stdout, new RegExp(flag), help.stdout);
  }
  assert.doesNotMatch(help.stdout, /--(?:all|yes|force)\b/, help.stdout);
  assert.doesNotMatch(help.stdout, /\[refs|<ref/i, help.stdout);

  const bare = run(root, ["remove"]);
  assert.equal(bare.status, 2, bare.all);
  assert.match(bare.stderr, /requires the --upstream-removed mode/);
  assert.match(bare.stderr, /requires at least one exact --file/);

  const noSelection = removal(root);
  assert.equal(noSelection.status, 2, noSelection.all);
  assert.match(noSelection.stderr, /requires at least one exact --file/);

  const duplicate = removal(root, [
    "--dry-run",
    "--file",
    CRLF_DESTINATION,
    "--file",
    CRLF_DESTINATION,
  ]);
  assert.equal(duplicate.status, 2, duplicate.all);
  assert.match(duplicate.stderr, /--file was repeated/);

  const meaninglessDiscard = removal(root, ["--dry-run", "--discard-adapted"]);
  assert.equal(meaninglessDiscard.status, 2, meaninglessDiscard.all);
  assert.match(meaninglessDiscard.stderr, /requires at least one selected --file/);
});

test("built removal lifecycle fails closed, then removes exact selected source/base/receipt state", () => {
  const { root, registry } = makeProject("lifecycle");

  const installed = run(root, ["add", OWNER, WITNESS]);
  assert.equal(installed.status, 0, installed.all);

  const crlfSource = absolute(root, CRLF_DESTINATION);
  const crlfBase = basePath(root, CRLF_DESTINATION);
  assert.deepEqual(readFileSync(crlfSource), Buffer.from(CRLF_SOURCE));
  assert.deepEqual(readFileSync(crlfBase), Buffer.from(CRLF_SOURCE));
  assert.equal(CRLF_DESTINATION.includes("\\"), false, "the selector must stay POSIX on Windows");

  const witnessSource = absolute(root, WITNESS_DESTINATION);
  const witnessBase = basePath(root, WITNESS_DESTINATION);
  const witnessSourceBefore = readFileSync(witnessSource);
  const witnessBaseBefore = readFileSync(witnessBase);

  writeCurrentOwner(registry);
  writeCurrentWitness(registry);

  // One unavailable receipt root blocks the whole all-roots graph. No partial
  // candidate list is returned and no managed byte changes.
  rmSync(join(registry, "witness.json"));
  const beforeUnavailable = snapshotManaged(root);
  const unavailable = removal(root, ["--dry-run", "--json"]);
  assert.equal(unavailable.status, 1, unavailable.all);
  const unavailableDocument = json(unavailable);
  assert.equal(unavailableDocument.ok, false);
  assert.deepEqual(unavailableDocument.candidates, []);
  assert.deepEqual(unavailableDocument.removals, []);
  assert.equal(unavailableDocument.receipt.written, false);
  assert.equal(unavailableDocument.updateState, null);
  assert.ok(
    unavailableDocument.diagnostics.some((diagnostic) => diagnostic.code === "fetch-failed"),
    JSON.stringify(unavailableDocument, null, 2),
  );
  assert.deepEqual(snapshotManaged(root), beforeUnavailable);

  // A different current item claiming the exact old destination withholds
  // deletion authority. This is reassignment, not a rename inference.
  writeCurrentWitness(registry, { reassignCrlf: true });
  const beforeReassignment = snapshotManaged(root);
  const reassigned = removal(root, ["--dry-run", "--file", CRLF_DESTINATION, "--json"]);
  assert.equal(reassigned.status, 1, reassigned.all);
  const reassignedDocument = json(reassigned);
  assert.ok(
    reassignedDocument.diagnostics.some(
      (diagnostic) => diagnostic.code === "remove-file-reassigned",
    ),
    JSON.stringify(reassignedDocument, null, 2),
  );
  assert.deepEqual(reassignedDocument.removals, []);
  assert.equal(reassignedDocument.receipt.written, false);
  assert.equal(reassignedDocument.updateState, null);
  assert.deepEqual(snapshotManaged(root), beforeReassignment);
  writeCurrentWitness(registry);

  const adaptedSource = absolute(root, ADAPTED_DESTINATION);
  write(adaptedSource, `${ADAPTED_SOURCE}// local adaptation\n`);
  rmSync(absolute(root, MISSING_DESTINATION));

  const discovery = removal(root, ["--dry-run", "--json"]);
  assert.equal(discovery.status, 0, discovery.all);
  const discoveryDocument = json(discovery);
  assert.equal(discoveryDocument.ok, true);
  assert.deepEqual(
    discoveryDocument.candidates.map((candidate) => candidate.destination),
    [ADAPTED_DESTINATION, MISSING_DESTINATION, CRLF_DESTINATION].sort(),
  );
  assert.deepEqual(candidateOf(discoveryDocument, CRLF_DESTINATION), {
    itemId: OWNER,
    destination: CRLF_DESTINATION,
    state: "unchanged",
    base: "present",
    selected: false,
    discardAdaptedRequired: false,
  });
  assert.equal(candidateOf(discoveryDocument, ADAPTED_DESTINATION).state, "adapted");
  assert.equal(candidateOf(discoveryDocument, ADAPTED_DESTINATION).discardAdaptedRequired, true);
  assert.equal(candidateOf(discoveryDocument, MISSING_DESTINATION).state, "missing");
  assert.equal(discoveryDocument.receipt.projectedChange, false);
  assert.equal(discoveryDocument.receipt.written, false);
  assert.deepEqual(discoveryDocument.removals, []);
  assert.equal(discoveryDocument.updateState, null);
  assert.deepEqual(readFileSync(crlfSource), Buffer.from(CRLF_SOURCE));

  const preview = removal(root, [
    "--dry-run",
    "--file",
    CRLF_DESTINATION,
    "--file",
    MISSING_DESTINATION,
    "--json",
  ]);
  assert.equal(preview.status, 0, preview.all);
  const previewDocument = json(preview);
  assert.equal(candidateOf(previewDocument, CRLF_DESTINATION).selected, true);
  assert.equal(candidateOf(previewDocument, MISSING_DESTINATION).selected, true);
  assert.equal(candidateOf(previewDocument, ADAPTED_DESTINATION).selected, false);
  assert.equal(previewDocument.receipt.projectedChange, true);
  assert.equal(previewDocument.receipt.written, false);
  assert.deepEqual(previewDocument.removals, []);
  assert.equal(previewDocument.updateState, null);
  assert.equal(existsSync(crlfSource), true);
  assert.equal(existsSync(crlfBase), true);

  const applied = removal(root, [
    "--file",
    CRLF_DESTINATION,
    "--file",
    MISSING_DESTINATION,
    "--json",
  ]);
  assert.equal(applied.status, 0, applied.all);
  const appliedDocument = json(applied);
  assert.deepEqual(removalOf(appliedDocument, CRLF_DESTINATION), {
    itemId: OWNER,
    destination: CRLF_DESTINATION,
    source: "removed",
    base: "removed",
  });
  assert.deepEqual(removalOf(appliedDocument, MISSING_DESTINATION), {
    itemId: OWNER,
    destination: MISSING_DESTINATION,
    source: "already-missing",
    base: "removed",
  });
  assert.deepEqual(appliedDocument.receipt, {
    path: "manteen.lock.json",
    projectedChange: true,
    written: true,
  });
  assert.deepEqual(appliedDocument.updateState, { changed: true, versioningRequired: true });
  assert.equal(existsSync(crlfSource), false);
  assert.equal(existsSync(crlfBase), false);
  assert.equal(existsSync(basePath(root, MISSING_DESTINATION)), false);

  const beforeAdaptedRefusal = snapshotManaged(root);
  const adaptedRefusal = removal(root, ["--file", ADAPTED_DESTINATION, "--json"]);
  assert.equal(adaptedRefusal.status, 1, adaptedRefusal.all);
  const adaptedRefusalDocument = json(adaptedRefusal);
  assert.equal(candidateOf(adaptedRefusalDocument, ADAPTED_DESTINATION).selected, true);
  assert.ok(
    adaptedRefusalDocument.diagnostics.some(
      (diagnostic) => diagnostic.code === "remove-adapted-file",
    ),
    JSON.stringify(adaptedRefusalDocument, null, 2),
  );
  assert.deepEqual(adaptedRefusalDocument.removals, []);
  assert.equal(adaptedRefusalDocument.receipt.written, false);
  assert.equal(adaptedRefusalDocument.updateState, null);
  assert.deepEqual(snapshotManaged(root), beforeAdaptedRefusal);

  const discarded = removal(root, ["--file", ADAPTED_DESTINATION, "--discard-adapted"]);
  assert.equal(discarded.status, 0, discarded.all);
  assert.match(discarded.stdout, new RegExp(`removed  ${ADAPTED_DESTINATION}`), discarded.stdout);
  assert.match(discarded.stdout, /source: removed/, discarded.stdout);
  assert.match(discarded.stdout, /base: removed/, discarded.stdout);
  assert.match(discarded.stderr, /info {2}state-versioning-required/, discarded.stderr);
  assert.equal(existsSync(adaptedSource), false);
  assert.equal(existsSync(basePath(root, ADAPTED_DESTINATION)), false);

  const finalReceipt = receipt(root);
  const owner = finalReceipt.items.find((item) => item.id === OWNER);
  assert.ok(owner, JSON.stringify(finalReceipt, null, 2));
  assert.equal(owner.direct, true, "file pruning must not demote an explicitly installed item");
  assert.deepEqual(owner.files, [], "a zero-file item remains in receipt v3");

  const witness = finalReceipt.items.find((item) => item.id === WITNESS);
  assert.ok(witness, JSON.stringify(finalReceipt, null, 2));
  assert.equal(witness.direct, true);
  assert.deepEqual(
    witness.files.map((file) => file.destination),
    [WITNESS_DESTINATION],
  );
  assert.deepEqual(readFileSync(witnessSource), witnessSourceBefore, "unselected source changed");
  assert.deepEqual(readFileSync(witnessBase), witnessBaseBefore, "unselected base changed");
});
