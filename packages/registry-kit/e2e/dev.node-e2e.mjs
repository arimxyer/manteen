import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(PACKAGE_ROOT, "dist/cli.mjs");

function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "manteen-kit-dev-node-")));
  const catalog = join(root, "manteen.registry.json");
  const source = join(root, "src/alpha.tsx");
  const outDir = join(root, "generated/r");
  mkdirSync(dirname(source), { recursive: true });
  writeFileSync(source, 'export const Alpha = () => "first";\n');
  const catalogValue = {
    name: "Dev fixture",
    namespace: "@dev",
    items: [
      {
        name: "alpha",
        kind: "component",
        files: [{ path: "src/alpha.tsx", as: "component" }],
      },
    ],
  };
  writeFileSync(catalog, `${JSON.stringify(catalogValue, null, 2)}\n`);
  return { root, catalog, source, outDir, catalogValue };
}

function eventStream(child) {
  const events = [];
  const waiters = [];
  const stderr = [];
  createInterface({ input: child.stdout }).on("line", (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      for (const waiter of waiters.splice(0)) waiter.reject(error);
      return;
    }
    events.push(event);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.predicate(event)) {
        waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(event);
      }
    }
  });
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

  return {
    stderr,
    wait(predicate, label) {
      const existing = events.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolveEvent, reject) => {
        const waiter = {
          predicate,
          resolve: resolveEvent,
          reject,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error(`Timed out waiting for ${label}; events: ${JSON.stringify(events)}`));
          }, 10_000),
        };
        waiters.push(waiter);
      });
    },
  };
}

test("built dev server retains last-good output and recovers in one foreground process", async () => {
  const created = fixture();
  const child = spawn(
    process.execPath,
    [CLI, "dev", created.catalog, created.outDir, "--port", "0", "--jsonl"],
    { stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  const stream = eventStream(child);

  try {
    const ready = await stream.wait((event) => event.event === "ready", "ready");
    assert.equal(ready.schemaVersion, 1);
    assert.equal(ready.sequence, 1);
    const first = await stream.wait(
      (event) => event.event === "build-succeeded" && event.sequence > ready.sequence,
      "initial build",
    );
    assert.equal(first.payload.namespace, "@dev");
    assert.deepEqual(first.payload.registryAddArgv, [
      "manteen",
      "registry",
      "add",
      "@dev",
      "--url",
      `${ready.payload.baseUrl}/{name}.json`,
      "--index",
      `${ready.payload.baseUrl}/registry.json`,
      "--dry-run",
      "--json",
    ]);

    const firstItem = await fetch(`${ready.payload.baseUrl}/alpha.json`);
    assert.equal(firstItem.status, 200);
    assert.match(await firstItem.text(), /first/);
    assert.equal((await fetch(`${ready.payload.baseUrl}/missing.json`)).status, 404);
    assert.equal(
      (await fetch(`${ready.payload.baseUrl}/alpha.json`, { method: "POST" })).status,
      405,
    );

    writeFileSync(created.catalog, "{ broken\n");
    const failed = await stream.wait(
      (event) => event.event === "build-failed" && event.sequence > first.sequence,
      "failed rebuild",
    );
    assert.equal(failed.payload.servingLastGood, true);
    const retained = await fetch(`${ready.payload.baseUrl}/alpha.json`);
    assert.equal(retained.status, 200);
    assert.match(await retained.text(), /first/);

    writeFileSync(created.source, 'export const Alpha = () => "second";\n');
    writeFileSync(created.catalog, `${JSON.stringify(created.catalogValue, null, 2)}\n`);
    const recovered = await stream.wait(
      (event) => event.event === "build-succeeded" && event.sequence > failed.sequence,
      "recovered rebuild",
    );
    assert.equal(recovered.payload.namespace, "@dev");
    const secondItem = await fetch(`${ready.payload.baseUrl}/alpha.json`);
    assert.equal(secondItem.status, 200);
    assert.match(await secondItem.text(), /second/);

    child.kill("SIGINT");
    const stopped = await stream.wait(
      (event) => event.event === "stopped" && event.sequence > recovered.sequence,
      "stopped event",
    );
    assert.equal(stopped.payload.reason, "SIGINT");
    const exitCode = await new Promise((accept) => child.once("exit", accept));
    assert.equal(exitCode, 0);
    assert.equal(stream.stderr.join(""), "");
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(created.root, { recursive: true, force: true });
  }
});
