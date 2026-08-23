import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowPath = resolve(import.meta.dirname, "../.github/workflows/ci.yml");
const workflow = readFileSync(workflowPath, "utf8");
const failures = [];
const bunVersion = "1.3.14";
const bunInstallCommand = "- run: bun install --frozen-lockfile";
const setupBunPattern = /- uses: oven-sh\/setup-bun@v2\n(?<body>(?: {8,10}.+\n)+)/g;
const bunCachePattern = /- uses: actions\/cache@v5\n(?<body>(?: {8,10}.+\n)+)/g;

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function jobSource(name, nextName) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  const end =
    nextName === undefined ? workflow.length : workflow.indexOf(`\n  ${nextName}:\n`, start + 1);
  expect(start !== -1, `missing ${name} job`);
  expect(end !== -1, `cannot find the end of the ${name} job`);
  return start === -1 || end === -1 ? "" : workflow.slice(start, end);
}

function validateBunInstallJob(name, source) {
  const setupBunBlocks = [...source.matchAll(setupBunPattern)];
  const cacheBlocks = [...source.matchAll(bunCachePattern)];
  const installIndexes = [...source.matchAll(new RegExp(bunInstallCommand, "g"))].map(
    (match) => match.index,
  );

  expect(setupBunBlocks.length === 1, `${name} must contain exactly one setup-bun block`);
  expect(cacheBlocks.length === 1, `${name} must contain exactly one Bun package-cache block`);
  expect(installIndexes.length === 1, `${name} must contain exactly one frozen Bun install`);

  const setupBun = setupBunBlocks[0];
  const cache = cacheBlocks[0];
  if (setupBun !== undefined) {
    expect(
      setupBun.groups?.body.includes(`bun-version: "${bunVersion}"`) === true,
      `${name} setup-bun must pin ${bunVersion}`,
    );
  }

  if (cache !== undefined) {
    const body = cache.groups?.body ?? "";
    expect(
      body.includes("path: ~/.bun/install/cache"),
      `${name} Bun cache must target only the global package cache`,
    );
    expect(
      body.includes(
        `bun-install-\${{ runner.os }}-\${{ runner.arch }}-${bunVersion}-\${{ hashFiles('bun.lock') }}`,
      ),
      `${name} Bun cache key must bind OS, architecture, pinned Bun, and bun.lock`,
    );
    expect(!body.includes("node_modules"), `${name} must never cache repository node_modules`);
    expect(
      !body.includes("restore-keys:"),
      `${name} Bun package cache must not fall back across lockfiles or Bun versions`,
    );
  }

  const checkoutIndex = source.indexOf("- uses: actions/checkout@v7");
  const setupBunIndex = setupBun?.index ?? -1;
  const cacheIndex = cache?.index ?? -1;
  const installIndex = installIndexes[0] ?? -1;
  expect(checkoutIndex !== -1, `${name} must check out the repository before installing`);
  expect(
    checkoutIndex < setupBunIndex && setupBunIndex < cacheIndex && cacheIndex < installIndex,
    `${name} must order checkout, setup-bun ${bunVersion}, Bun cache, then frozen install`,
  );
}

const classify = jobSource("classify", "quality");
const quality = jobSource("quality", "built-node");
const builtNode = jobSource("built-node", "packed-consumer");
const packedConsumer = jobSource("packed-consumer", "ci-gate");
const gate = jobSource("ci-gate");

expect(
  classify.includes("docs_only: ${{ steps.changed-paths.outputs.docs_only }}"),
  "classifier must own docs_only",
);
expect(
  classify.includes('echo "docs_only=false" >> "$GITHUB_OUTPUT"'),
  "classifier must default docs_only to false",
);
for (const invariant of [
  'if [[ "$EVENT_NAME" != "pull_request" ]]',
  "sha_pattern='^[0-9a-fA-F]{40,64}$'",
  'git diff --name-status -z --no-renames "$BASE_SHA...$HEAD_SHA"',
  'if [[ ! -s "$diff_file" ]]',
  'if [[ ! "$status" =~ ^[AMD]$ ]]',
]) {
  expect(
    classify.includes(invariant),
    `classifier lost fail-closed check ${JSON.stringify(invariant)}`,
  );
}
expect(!quality.includes("needs:"), "quality must start independently of path classification");
for (const command of [
  "bun install --frozen-lockfile",
  "node scripts/guard-workspace.mjs",
  "bun run test",
  "bun run build:registry",
  "bun run build:site",
  "bun run site:build",
  "bun run typecheck",
  "bun run lint",
  "node scripts/guard-runtime-apis.mjs",
  "bun scripts/guard-house-styles-api-evidence.mjs",
  "node packages/cli/scripts/guard-diagnostics.mjs",
  "node scripts/guard-release.mjs",
  "node scripts/guard-ci.mjs",
  "node scripts/guard-deps.mjs",
]) {
  expect(quality.includes(`- run: ${command}`), `quality is missing ${command}`);
}

for (const [name, source] of [
  ["built-node", builtNode],
  ["packed-consumer", packedConsumer],
]) {
  expect(source.includes("needs: classify"), `${name} must wait only for classification`);
  expect(
    source.includes("if: needs.classify.outputs.docs_only != 'true'"),
    `${name} must skip only on an explicit docs-only result`,
  );
}

expect(
  gate.includes("needs: [classify, quality, built-node, packed-consumer]"),
  "CI gate must observe every verification job",
);
expect(
  gate.includes("CLASSIFY_RESULT: ${{ needs.classify.result }}"),
  "CI gate must inspect classifier result",
);
expect(
  gate.includes('if [[ "$CLASSIFY_RESULT" != "success" ]]'),
  "CI gate must fail when classification fails",
);
expect(
  gate.includes('if [[ "$QUALITY_RESULT" != "success" ]]'),
  "CI gate must require quality success",
);

for (const [name, source] of [
  ["quality", quality],
  ["built-node", builtNode],
  ["packed-consumer", packedConsumer],
]) {
  validateBunInstallJob(name, source);
}

for (const lane of [
  'os: ubuntu-latest\n            node: "22.12.0"\n            shard: all',
  'os: ubuntu-latest\n            node: "24"\n            shard: all',
  'os: ubuntu-latest\n            node: "26"\n            shard: all',
  'os: macos-latest\n            node: "22.12.0"\n            shard: all',
  'os: windows-latest\n            node: "22.12.0"\n            shard: 1/2',
  'os: windows-latest\n            node: "22.12.0"\n            shard: 2/2',
]) {
  expect(builtNode.includes(lane), `built-node matrix is missing ${JSON.stringify(lane)}`);
}
expect(
  [...builtNode.matchAll(/^ {10}- os:/gm)].length === 6,
  "built-node matrix must contain exactly the six guarded lanes",
);
expect(
  builtNode.includes("MANTEEN_E2E_SHARD: ${{ matrix.shard }}"),
  "built-node matrix must pass its complete shard selection to the real-Node runner",
);
for (const command of [
  "bun install --frozen-lockfile",
  "node scripts/guard-workspace.mjs",
  "bun run build:kit",
  "bun run build:registry",
  "bun --cwd=packages/cli run build",
  "node packages/cli/scripts/run-e2e.mjs",
]) {
  expect(builtNode.includes(`- run: ${command}`), `built-node is missing ${command}`);
}

for (const lane of [
  "os: ubuntu-latest\n            manager: npm",
  "os: ubuntu-latest\n            manager: pnpm",
  "os: ubuntu-latest\n            manager: yarn",
  "os: ubuntu-latest\n            manager: bun",
  "os: windows-latest\n            manager: npm",
]) {
  expect(
    packedConsumer.includes(lane),
    `packed-consumer matrix is missing ${JSON.stringify(lane)}`,
  );
}
expect(
  [...packedConsumer.matchAll(/^ {10}- os:/gm)].length === 5,
  "packed-consumer matrix must contain exactly the five guarded lanes",
);
for (const command of [
  "bun install --frozen-lockfile",
  "node scripts/guard-workspace.mjs",
  "bun run build:kit",
  "bun run build:registry",
  "bun --cwd=packages/cli run build",
  "node --test packages/cli/e2e/packed-consumer.node-e2e.mjs",
]) {
  expect(packedConsumer.includes(command), `packed-consumer is missing ${command}`);
}

if (failures.length > 0) {
  console.error(`guard-ci: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    "guard-ci: clean — fail-closed classification, stable gate, exact caches, and portability lanes are intact.",
  );
}
