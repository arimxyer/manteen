import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashFileBytes } from "../src/apply/preflight";
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

  test("automatically falls back for distinct adjacent TypeScript anchors", () => {
    const base = 'import { A } from "a";\nimport { B } from "b";\n';
    const local = 'import { A, LocalA } from "a";\nimport { B } from "b";\n';
    const incoming = 'import { A } from "a";\nimport { B, IncomingB } from "b";\n';

    expect(mergeFile(local, base, incoming).ok).toBe(false);
    expect(mergeFile(local, base, incoming, "component.tsx")).toEqual({
      ok: true,
      content: 'import { A, LocalA } from "a";\nimport { B, IncomingB } from "b";\n',
    });
  });

  test("does not use the fallback for non-TypeScript or same-key edits", () => {
    const base = "export const value = 1;\n";
    const local = "export const value = 2;\n";
    const incoming = "export const value = 3;\n";
    const originalConflict = mergeFile(local, base, incoming);

    expect(originalConflict.ok).toBe(false);
    expect(mergeFile(local, base, incoming, "component.css")).toEqual(originalConflict);
    expect(mergeFile(local, base, incoming, "component.ts")).toEqual(originalConflict);
  });

  test("returns a clean diff3 result before consulting TypeScript syntax", () => {
    const base =
      "export const broken = ;\nexport const middleA = 1;\nexport const middleB = 1;\nexport const other = 1;\n";
    const local = base.replace("broken = ;", "broken = local;");
    const incoming = base.replace("other = 1", "other = 2");

    expect(mergeFile(local, base, incoming, "intentionally-invalid.ts")).toEqual({
      ok: true,
      content:
        "export const broken = local;\nexport const middleA = 1;\nexport const middleB = 1;\nexport const other = 2;\n",
    });
  });
});

describe("cross-platform missing-path hashing", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  function root(): string {
    const value = mkdtempSync(join(tmpdir(), "manteen-hash-path-"));
    roots.push(value);
    return value;
  }

  test("returns null when missing parent directories can be created", () => {
    expect(hashFileBytes(join(root(), "missing", "nested", "base.tsx"))).toBeNull();
  });

  test("does not treat a file blocking the parent path as absence", () => {
    const directory = root();
    const blocker = join(directory, "blocked");
    writeFileSync(blocker, "not a directory\n");

    try {
      hashFileBytes(join(blocker, "nested", "base.tsx"));
      throw new Error("expected a blocked parent path to throw");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("ENOTDIR");
    }
  });

  test("does not treat a directory occupying the leaf as absence", () => {
    const leaf = join(root(), "base.tsx");
    mkdirSync(leaf);

    try {
      hashFileBytes(leaf);
      throw new Error("expected a directory at the leaf to throw");
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe("EISDIR");
    }
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
