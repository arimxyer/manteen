import { defineConfig } from "tsdown";

export default defineConfig({
  // Flat output on purpose: `loadSchema` resolves `schema/` relative to the
  // bundle's own directory, so every entry has to sit one level below the
  // package root. Nesting `cli` under `dist/cli/` would break it.
  entry: { index: "src/index.ts", cli: "src/cli/index.ts" },
  outDir: "dist",
  format: "esm",
  platform: "node",
  // `import.meta.dirname` — the portable replacement for Bun's
  // `import.meta.dir` — landed in Node 20.11.
  target: "node20.11",
  dts: true,
  clean: true,
});
