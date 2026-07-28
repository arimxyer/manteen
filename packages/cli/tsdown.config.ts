import { defineConfig } from "tsdown";

export default defineConfig({
  // Flat output on purpose: `schema/` resolves relative to the bundle's own
  // directory (`resolve(import.meta.dirname, "../schema/...")`), so every entry
  // has to sit one level below the package root. Nesting `cli` under
  // `dist/cli/` would silently repoint that `..` and ENOENT at runtime only.
  entry: { index: "src/index.ts", cli: "src/cli/index.ts" },
  outDir: "dist",
  format: "esm",
  platform: "node",
  // >=22.12 is the floor because commander 15 requires it. `process.loadEnvFile`
  // (20.12, called unguarded per §5a resolution 1) and `import.meta.dirname`
  // (20.11) are both satisfied well below it. Node 20 went EOL 2026-04-30, so
  // nothing is lost — 22 is the oldest line still receiving fixes.
  target: "node22.12",
  // `manteen-kit` must stay external. Its `createWireValidator()` resolves the
  // vendored wire schema via `resolve(import.meta.dirname, "..")` = the KIT's
  // package root. Inlining it repoints that at packages/cli and throws ENOENT
  // at runtime only — nothing about the build would look wrong.
  external: ["manteen-kit"],
  dts: true,
  clean: true,
});
