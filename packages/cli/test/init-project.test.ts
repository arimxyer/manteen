import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createProjectSnapshot,
  detectProjectFramework,
  InitProjectError,
} from "../src/init/project";
import { frameworkSetFor } from "../src/init/types";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "manteen-init-project-"));
  roots.push(root);
  return root;
}

function write(root: string, path: string, content: string): void {
  const destination = join(root, path);
  mkdirSync(join(destination, ".."), { recursive: true });
  writeFileSync(destination, content, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("W6 filesystem project ports", () => {
  test("detects and snapshots the generated Vite application tsconfig", async () => {
    const root = fixture();
    write(root, "package.json", '{"devDependencies":{"vite":"^8"}}\n');
    write(root, "index.html", '<div id="root"></div>\n');
    write(root, "src/main.tsx", "import './App';\n");
    write(root, "src/App.tsx", "export default function App() { return <main />; }\n");
    write(root, "tsconfig.app.json", '{"compilerOptions":{}}\n');
    write(root, "vite.config.ts", "export default { plugins: [] };\n");

    const detection = await detectProjectFramework(root);
    expect(detection.ok && detection.framework.kind).toBe("vite");

    const project = await createProjectSnapshot(root, frameworkSetFor("vite"));
    expect(project.layout.sourceRoot).toBe(join(root, "src"));
    expect(project.layout.tsconfigPath).toBe(join(root, "tsconfig.app.json"));
    expect(project.layout.configPath).toBe(join(root, "manteen.json"));
    expect(project.files.get(join(root, "src/App.tsx"))).toContain("function App");
    expect(project.declaredDependencies.get("vite")).toBe("^8");
  });

  test("keeps a Vite SPA using react-router on the Vite path", async () => {
    const root = fixture();
    write(
      root,
      "package.json",
      '{"dependencies":{"react-router":"^8"},"devDependencies":{"vite":"^8"}}\n',
    );
    write(root, "index.html", '<div id="root"></div>\n');
    write(root, "src/main.tsx", "import './App';\n");
    write(root, "vite.config.ts", "export default {};\n");

    const detection = await detectProjectFramework(root);
    expect(detection.ok && detection.framework.kind).toBe("vite");
  });

  test("refuses split root/src Next router entries before an adapter can guess", async () => {
    const root = fixture();
    write(root, "package.json", '{"dependencies":{"next":"^16"}}\n');
    write(root, "app/layout.tsx", "export default function Layout() { return null; }\n");
    write(root, "src/pages/_app.tsx", "export default function App() { return null; }\n");
    write(root, "src/pages/_document.tsx", "export default function Document() { return null; }\n");
    write(root, "tsconfig.json", '{"compilerOptions":{}}\n');

    expect(createProjectSnapshot(root, frameworkSetFor("next-hybrid"))).rejects.toBeInstanceOf(
      InitProjectError,
    );
  });
});
