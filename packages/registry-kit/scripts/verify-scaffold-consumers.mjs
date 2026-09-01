import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { applyScaffold, compileRegistry, planScaffold } from "../dist/index.mjs";

const MANTINE_VERSIONS = ["9.5.0", "9.5.2"];
const templates = [
  ["component-basic", "proof-basic"],
  ["component-styles-api", "proof-styles-2d"],
  ["component-polymorphic", "proof-polymorphic"],
];

for (const mantineVersion of MANTINE_VERSIONS) {
  const root = mkdtempSync(join(tmpdir(), `manteen-scaffold-${mantineVersion}-`));
  try {
    const catalogPath = join(root, "manteen.registry.json");
    const profilePath = join(root, "manteen.author-profile.json");
    const baseCatalog = {
      name: `Mantine ${mantineVersion} scaffold proof`,
      namespace: "@scaffold-proof",
      authorProfile: "manteen.author-profile.json",
      items: [
        {
          name: "existing",
          kind: "component",
          files: [{ path: "src/existing.tsx", as: "component" }],
          stylesApi: { Existing: ["root"] },
        },
      ],
    };
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "src/existing.tsx"), "export const Existing = () => null;\n");
    writeFileSync(join(root, "evidence/existing.contract"), "existing ownership\n");
    writeFileSync(catalogPath, `${JSON.stringify(baseCatalog, null, 2)}\n`);
    writeFileSync(
      profilePath,
      `${JSON.stringify(
        {
          schemaVersion: 2,
          stylesApi: [
            {
              item: "existing",
              component: "Existing",
              evidence: "evidence/existing.contract",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ name: "manteen-scaffold-registration-proof", private: true }, null, 2)}\n`,
    );

    for (const [template, itemName] of templates) {
      const input = { catalogPath, template, itemName, register: true };
      const plan = planScaffold(input);
      if (!plan.safe) throw new Error(JSON.stringify(plan.diagnostics));
      applyScaffold(input, plan.planDigest);
    }
    const compiled = compileRegistry(catalogPath);
    if (compiled.failures.length > 0 || compiled.items.length !== templates.length + 1) {
      throw new Error(
        `Independent registry compilation failed: ${JSON.stringify(compiled.failures)}`,
      );
    }

    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify(
        {
          name: `manteen-scaffold-proof-${mantineVersion.replaceAll(".", "-")}`,
          private: true,
          type: "module",
          dependencies: {
            "@mantine/core": mantineVersion,
            "@types/react": "19.2.7",
            "@types/react-dom": "19.2.3",
            react: "19.2.1",
            "react-dom": "19.2.1",
            typescript: "5.9.3",
            vitest: "3.2.4",
          },
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(root, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            isolatedModules: true,
            verbatimModuleSyntax: true,
          },
          include: ["src/**/*.tsx", "test/**/*.tsx", "types.d.ts"],
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      join(root, "types.d.ts"),
      'declare module "*.module.css" {\n  const classes: Record<string, string>;\n  export default classes;\n}\n',
    );

    execFileSync(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false"],
      { cwd: root, stdio: "inherit" },
    );
    execFileSync(resolve(root, "node_modules/.bin/tsc"), ["--noEmit"], {
      cwd: root,
      stdio: "inherit",
    });
    process.stdout.write(
      `Mantine ${mantineVersion}: three registered scaffold templates typechecked and compiled.\n`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
