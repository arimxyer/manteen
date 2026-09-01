import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { createAliasResolver } from "../src/config/aliases";
import type { LoadedConfig } from "../src/config/types";

const ROOT = "/project";
const aliases = {
  components: "@/components",
  ui: "@/components/ui",
  hooks: "@/hooks",
  lib: "@/lib",
};
const tsconfig = {
  path: "/project/tsconfig.json",
  config: {
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@/components/ui/*": ["./src/components/ui/*"],
        "@/components/*": ["./src/components/*"],
        "@/hooks/*": ["./src/hooks/*"],
        "@/lib/*": ["./src/lib/*"],
      },
    },
  },
} as LoadedConfig["tsconfig"];

describe("explicit target aliases", () => {
  const target = createAliasResolver(tsconfig, aliases, ROOT, () => true);
  const item = { id: "@proof/widget" } as never;

  test("refuses the common but unsupported @/ spelling instead of creating a literal @ tree", () => {
    const result = target(
      { path: "widget.tsx", type: "registry:ui", target: "@/components/widget.tsx" },
      item,
    );

    expect(result).toEqual({
      refused: "target-refused-type",
      detail:
        '@proof/widget declares unknown target alias "@/components/widget.tsx"; use @components/, @ui/, @hooks/, @lib/, ~/ or a relative path',
    });
  });

  test("keeps supported placeholders and explicit relative paths working", () => {
    expect(
      target({ path: "widget.tsx", type: "registry:ui", target: "@components/widget.tsx" }, item),
    ).toEqual({ destination: resolve(ROOT, "src/components/widget.tsx") });
    expect(
      target({ path: "widget.tsx", type: "registry:ui", target: "src/widget.tsx" }, item),
    ).toEqual({ destination: resolve(ROOT, "src/widget.tsx") });
  });
});
