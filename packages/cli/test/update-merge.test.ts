import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkReservedTargets } from "../src/gates/reserved";
import { mergeFile, splitExactLines } from "../src/plan/merge-file";
import { manteenStateIsGitIgnored } from "../src/plan/state-ignored";
import type { ResolvedFile } from "../src/plan/types";

describe("exact three-way file merge", () => {
  test("combines non-overlapping local and incoming edits", () => {
    const base = "one\ntwo\nthree\nfour\n";
    const local = "one local\ntwo\nthree\nfour\n";
    const incoming = "one\ntwo\nthree\nfour upstream\n";

    expect(mergeFile(local, base, incoming)).toEqual({
      ok: true,
      content: "one local\ntwo\nthree\nfour upstream\n",
    });
  });

  test("reports overlapping edits without synthesizing conflict markers", () => {
    const merged = mergeFile("value = local\n", "value = base\n", "value = upstream\n");
    expect(merged.ok).toBe(false);
    if (merged.ok) return;
    expect(merged.conflicts).toHaveLength(1);
    expect(JSON.stringify(merged)).not.toContain("<<<<<<<");
  });

  test("preserves line endings and final-newline state as merge tokens", () => {
    expect(splitExactLines("a\r\nb\r\n")).toEqual(["a\r\n", "b\r\n"]);
    expect(splitExactLines("a\nb")).toEqual(["a\n", "b"]);
    expect(splitExactLines("")).toEqual([]);
  });
});

describe("reserved Manteen state tree", () => {
  function file(destination: string): ResolvedFile {
    return {
      itemId: "@test/widget",
      sourcePath: "widget.tsx",
      wireType: "registry:ui",
      destination,
      content: "export const Widget = 1;\n",
    };
  }

  test("refuses registry output anywhere under .manteen", () => {
    const diagnostics = checkReservedTargets(
      [file("/project/.manteen/bases/widget.tsx")],
      "/project",
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("target-reserved");
    expect(diagnostics[0]?.forceable).toBe(false);
  });

  test("does not reserve ordinary dot-directories", () => {
    expect(checkReservedTargets([file("/project/.storybook/widget.tsx")], "/project")).toEqual([]);
  });
});

describe("recognizing an ignored state tree", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  function withGitignore(contents: string | null): string {
    const root = mkdtempSync(join(tmpdir(), "manteen-ignore-"));
    roots.push(root);
    if (contents !== null) writeFileSync(join(root, ".gitignore"), contents);
    return root;
  }

  test("recognizes the spellings people write for a root directory", () => {
    for (const line of [
      ".manteen",
      ".manteen/",
      "/.manteen",
      "/.manteen/",
      ".manteen/*",
      ".manteen/**",
      "**/.manteen",
      "**/.manteen/",
    ]) {
      expect(manteenStateIsGitIgnored(withGitignore(`node_modules\n${line}\ndist\n`))).toBe(true);
    }
  });

  test("comments, blank lines and trailing whitespace do not change the answer", () => {
    expect(manteenStateIsGitIgnored(withGitignore("\n# .manteen\n\n  \nnode_modules\n"))).toBe(
      false,
    );
    expect(manteenStateIsGitIgnored(withGitignore("\n.manteen/   \n"))).toBe(true);
  });

  test("a later negation wins, because that is Git's own precedence", () => {
    expect(manteenStateIsGitIgnored(withGitignore(".manteen\n!.manteen\n"))).toBe(false);
    expect(manteenStateIsGitIgnored(withGitignore("!.manteen\n.manteen\n"))).toBe(true);
  });

  test("an absent or unrelated .gitignore answers no rather than throwing", () => {
    expect(manteenStateIsGitIgnored(withGitignore(null))).toBe(false);
    expect(manteenStateIsGitIgnored(withGitignore("node_modules\ndist\n.env*\n"))).toBe(false);
    // Substring, not a rule: `false` here is correct rather than a near miss.
    expect(manteenStateIsGitIgnored(withGitignore(".manteen-cache\n"))).toBe(false);
  });
});
