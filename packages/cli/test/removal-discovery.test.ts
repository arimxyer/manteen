import { describe, expect, test } from "bun:test";
import type { Receipt } from "../src/plan/types";
import { classifyRemovalUsage, discoverUpstreamRemovals } from "../src/removal/discovery";
import type {
  RemovalCommandOptions,
  RemovalDestinationSnapshot,
  RemovalDiscoveryInput,
} from "../src/removal/types";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function receipt(files: string[]): Receipt {
  return {
    lockfileVersion: 3,
    items: [
      {
        id: "@house/widget",
        registry: "@house",
        sourceUrl: "https://example.test/r/widget.json",
        wireType: "registry:ui",
        direct: true,
        files: files.map((destination, index) => ({
          destination,
          wireType: "registry:ui",
          installedSha256: index === 1 ? HASH_B : HASH_A,
          baseSha256: HASH_A,
        })),
      },
    ],
    theme: null,
    styles: null,
  };
}

function options(overrides: Partial<RemovalCommandOptions> = {}): RemovalCommandOptions {
  return {
    upstreamRemoved: true,
    dryRun: true,
    files: [],
    discardAdapted: false,
    ...overrides,
  };
}

function regular(destination: string, source: string, base = HASH_A): RemovalDestinationSnapshot {
  return {
    destination,
    source: { kind: "regular", sha256: source },
    base: { kind: "regular", sha256: base },
  };
}

function input(
  files: string[],
  snapshots: RemovalDestinationSnapshot[],
  overrides: Partial<RemovalDiscoveryInput> = {},
): RemovalDiscoveryInput {
  return {
    receipt: receipt(files),
    currentItems: [{ id: "@house/widget", ordinaryDestinations: [] }],
    currentArtifactDestinations: [],
    snapshots,
    options: options(),
    ...overrides,
  };
}

describe("upstream-removal usage", () => {
  test("requires the mode, an exact real-run selection, and meaningful destructive intent", () => {
    expect(
      classifyRemovalUsage(
        options({ upstreamRemoved: false, dryRun: false, discardAdapted: true }),
      ).map((issue) => issue.kind),
    ).toEqual(["missing-mode", "missing-selection", "meaningless-discard-adapted"]);
  });

  test("refuses duplicate and non-POSIX selectors without normalizing them", () => {
    const issues = classifyRemovalUsage(
      options({ files: ["./src/old.tsx", "src\\old.tsx", "src/old.tsx", "src/old.tsx"] }),
    );
    expect(issues.map((issue) => issue.kind)).toEqual([
      "invalid-file",
      "invalid-file",
      "duplicate-file",
    ]);
    expect(issues.every((issue) => issue.exit === 2)).toBe(true);
  });
});

describe("pure upstream-removal discovery", () => {
  test("classifies unchanged, adapted, and missing against pristine baseSha256", () => {
    const result = discoverUpstreamRemovals(
      input(
        ["src/adapted.tsx", "src/missing.tsx", "src/unchanged.tsx"],
        [
          regular("src/adapted.tsx", HASH_B, HASH_C),
          {
            destination: "src/missing.tsx",
            source: { kind: "missing" },
            base: { kind: "missing" },
          },
          regular("src/unchanged.tsx", HASH_A),
        ],
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.candidates).toEqual([
      {
        itemId: "@house/widget",
        destination: "src/adapted.tsx",
        state: "adapted",
        base: "corrupt",
        selected: false,
        discardAdaptedRequired: true,
      },
      {
        itemId: "@house/widget",
        destination: "src/missing.tsx",
        state: "missing",
        base: "missing",
        selected: false,
        discardAdaptedRequired: false,
      },
      {
        itemId: "@house/widget",
        destination: "src/unchanged.tsx",
        state: "unchanged",
        base: "present",
        selected: false,
        discardAdaptedRequired: false,
      },
    ]);
  });

  test("uses exact destinations only and does not infer a rename from a new current file", () => {
    const result = discoverUpstreamRemovals(
      input(["src/old-name.tsx"], [regular("src/old-name.tsx", HASH_A)], {
        currentItems: [{ id: "@house/widget", ordinaryDestinations: ["src/new-name.tsx"] }],
      }),
    );
    expect(result.candidates.map((candidate) => candidate.destination)).toEqual([
      "src/old-name.tsx",
    ]);
  });

  test("refuses selected still-published, reassigned, and unowned destinations", () => {
    const selected = ["src/still.tsx", "src/moved.tsx", "src/unowned.tsx"];
    const result = discoverUpstreamRemovals(
      input(
        ["src/still.tsx", "src/moved.tsx"],
        [regular("src/still.tsx", HASH_A), regular("src/moved.tsx", HASH_A)],
        {
          currentItems: [
            { id: "@house/widget", ordinaryDestinations: ["src/still.tsx"] },
            { id: "@other/widget", ordinaryDestinations: ["src/moved.tsx"] },
          ],
          options: options({ files: selected }),
        },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "remove-file-still-published",
      "remove-file-reassigned",
      "remove-file-unowned",
    ]);
  });

  test("names recorded or current theme/styles destinations as artifacts, not unowned files", () => {
    const recordedArtifactReceipt = receipt([]);
    recordedArtifactReceipt.theme = {
      destination: "src/lib/theme.ts",
      sha256: HASH_A,
      sources: [{ itemId: "@house/widget", kind: "absorbed-file", path: "theme.ts" }],
    };
    const result = discoverUpstreamRemovals({
      receipt: recordedArtifactReceipt,
      currentItems: [{ id: "@house/widget", ordinaryDestinations: [] }],
      currentArtifactDestinations: ["src/manteen.css"],
      snapshots: [],
      options: options({ files: ["src/lib/theme.ts", "src/manteen.css"] }),
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "remove-file-artifact",
      "remove-file-artifact",
    ]);
  });

  test("requires explicit discard authority only for a selected adapted candidate", () => {
    const without = discoverUpstreamRemovals(
      input(["src/old.tsx"], [regular("src/old.tsx", HASH_B)], {
        options: options({ files: ["src/old.tsx"] }),
      }),
    );
    expect(without.ok).toBe(false);
    expect(without.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "remove-adapted-file",
    ]);

    const withAuthority = discoverUpstreamRemovals(
      input(["src/old.tsx"], [regular("src/old.tsx", HASH_B)], {
        options: options({ files: ["src/old.tsx"], discardAdapted: true }),
      }),
    );
    expect(withAuthority.ok).toBe(true);
    expect(withAuthority.candidates[0]?.selected).toBe(true);
  });

  test("fails closed without a partial list on unsupported source/base state", () => {
    const result = discoverUpstreamRemovals(
      input(
        ["src/good.tsx", "src/link.tsx"],
        [
          regular("src/good.tsx", HASH_A),
          {
            destination: "src/link.tsx",
            source: { kind: "unsupported", reason: "symbolic link" },
            base: { kind: "missing" },
          },
        ],
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("remove-path-unsupported");
  });

  test("a blocking resolver diagnostic yields no partial discovery", () => {
    const result = discoverUpstreamRemovals(
      input(["src/old.tsx"], [regular("src/old.tsx", HASH_A)], {
        resolutionDiagnostics: [
          {
            code: "fetch-failed",
            severity: "error",
            message: "current item unavailable",
            forceable: false,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("fetch-failed");
  });
});
