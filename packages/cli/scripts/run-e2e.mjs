/**
 * Cross-platform expansion for the built-Node e2e tier.
 *
 * Bash expands `e2e/*.node-e2e.mjs` before Node starts; PowerShell and cmd.exe
 * do not make the same promise. Enumerating here keeps the required naming
 * convention and the shipped runtime identical on every operating system.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const e2eDir = join(packageRoot, "e2e");
const files = readdirSync(e2eDir)
  .filter((entry) => entry.endsWith(".node-e2e.mjs"))
  .sort()
  .map((entry) => join(e2eDir, entry));

const shard = process.env.MANTEEN_E2E_SHARD?.trim() || "all";
const shardMatch = /^(\d+)\/(\d+)$/.exec(shard);

if (
  shard !== "all" &&
  (shardMatch === null ||
    Number(shardMatch[1]) < 1 ||
    Number(shardMatch[2]) < 1 ||
    Number(shardMatch[1]) > Number(shardMatch[2]))
) {
  console.error(
    `Invalid MANTEEN_E2E_SHARD ${JSON.stringify(shard)}; expected "all" or <index>/<total>.`,
  );
  process.exitCode = 1;
} else if (files.length === 0) {
  console.error(`No *.node-e2e.mjs files found in ${e2eDir}`);
  process.exitCode = 1;
} else {
  const testArguments = ["--test", "--test-concurrency=1"];
  if (shard !== "all") testArguments.push(`--test-shard=${shard}`);
  testArguments.push(...files);

  // macOS exposes its temporary directory below `/var`, an OS-owned symlink to
  // `/private/var`. Give fixtures the canonical root so they do not trip the
  // production output-link refusal before the command under test can run.
  const environment =
    process.platform === "win32"
      ? process.env
      : {
          ...process.env,
          TEMP: realpathSync(tmpdir()),
          TMP: realpathSync(tmpdir()),
          TMPDIR: realpathSync(tmpdir()),
        };
  // These files create isolated registries and package-manager children. Run
  // them one at a time so Windows does not turn concurrent shim spawns into a
  // product-level `spawn-failed` result.
  const result = spawnSync(process.execPath, testArguments, {
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;

  if (result.signal !== null) {
    console.error(`The built-Node e2e tier was terminated by ${result.signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
