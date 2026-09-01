import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyConfigEdit, editTopLevelMember, planConfigEdit } from "../src/config/edit";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(contents: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "manteen-config-edit-"));
  roots.push(root);
  const path = join(root, "manteen.json");
  writeFileSync(path, contents);
  return { root, path };
}

describe("surgical config edits", () => {
  test("replaces, inserts, and removes only one top-level member", () => {
    const source = `{
  "$schema": "./schema.json",
  "registries": {
    "@house": "https://one.test/{name}.json"
  },
  "aliases": { "ui": "@/ui" }
}
`;
    const registries = {
      "@house": "https://one.test/{name}.json",
      "@workshop": "https://two.test/{name}.json",
    };
    const replaced = editTopLevelMember(source, "registries", registries);

    expect(JSON.parse(replaced).registries).toEqual(registries);
    expect(replaced.slice(0, replaced.indexOf('"registries"'))).toBe(
      source.slice(0, source.indexOf('"registries"')),
    );
    expect(replaced.slice(replaced.indexOf(',\n  "aliases"'))).toBe(
      source.slice(source.indexOf(',\n  "aliases"')),
    );

    const inserted = editTopLevelMember(source, "verification", { add: ["test"] });
    expect(JSON.parse(inserted).verification).toEqual({ add: ["test"] });
    expect(inserted).toContain('"aliases": { "ui": "@/ui" },\n  "verification"');

    const removed = editTopLevelMember(inserted, "verification", undefined);
    expect(removed).toBe(source);
  });

  test("applies only an exact reviewed pre-image and reports mutation truth", () => {
    const created = fixture('{"registries":{"@house":"https://one.test/{name}.json"}}\n');
    const plan = planConfigEdit(created.root, "registry-add:@two", "registries", {
      "@house": "https://one.test/{name}.json",
      "@two": "https://two.test/{name}.json",
    });

    expect(applyConfigEdit(plan, plan.planDigest)).toEqual({
      ok: true,
      mutated: true,
      failure: null,
    });
    expect(JSON.parse(readFileSync(created.path, "utf8")).registries).toHaveProperty("@two");

    const stale = planConfigEdit(created.root, "registry-add:@three", "registries", {
      ...JSON.parse(readFileSync(created.path, "utf8")).registries,
      "@three": "https://three.test/{name}.json",
    });
    writeFileSync(created.path, `${readFileSync(created.path, "utf8").trimEnd()} \n`);
    expect(applyConfigEdit(stale, stale.planDigest)).toMatchObject({
      ok: false,
      mutated: false,
      failure: { kind: "config-plan-stale" },
    });
  });
});
