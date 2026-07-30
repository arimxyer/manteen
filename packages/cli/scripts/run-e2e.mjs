/**
 * Cross-platform expansion for the built-Node e2e tier.
 *
 * Bash expands `e2e/*.node-e2e.mjs` before Node starts; PowerShell and cmd.exe
 * do not make the same promise. Enumerating here keeps the required naming
 * convention and the shipped runtime identical on every operating system.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const e2eDir = join(packageRoot, "e2e");
const files = readdirSync(e2eDir)
  .filter((entry) => entry.endsWith(".node-e2e.mjs"))
  .sort()
  .map((entry) => join(e2eDir, entry));

if (files.length === 0) {
  console.error(`No *.node-e2e.mjs files found in ${e2eDir}`);
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
  if (result.error) throw result.error;

  if (result.signal !== null) {
    console.error(`The built-Node e2e tier was terminated by ${result.signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
