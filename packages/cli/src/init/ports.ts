/** Production ports for the pure W6 init plan/apply cores. */
import { addDependency, addDependencyCommand, detectPackageManager } from "nypm";

import { createJournal } from "../apply/journal";
import { hashFileBytes } from "../apply/preflight";
import { CANCELLED, confirm } from "../ui";
import { nextAppAdapter } from "./adapters/next-app";
import { nextPagesAdapter } from "./adapters/next-pages";
import { reactRouterAdapter } from "./adapters/react-router";
import { viteAdapter } from "./adapters/vite";
import { createProjectSnapshot, detectProjectFramework } from "./project";
import type {
  InitAdapter,
  InitApplyPorts,
  InitInstallInput,
  InitInstallResult,
  InitPlannedDependency,
  InitPlanPorts,
  InitTierAFramework,
  InitWriteJournal,
} from "./types";

const ADAPTERS: Record<InitTierAFramework, InitAdapter> = {
  vite: viteAdapter,
  "next-app": nextAppAdapter,
  "next-pages": nextPagesAdapter,
  "react-router": reactRouterAdapter,
};

function spec(dependency: InitPlannedDependency): string {
  return dependency.range === "" ? dependency.name : `${dependency.name}@${dependency.range}`;
}

export function initInstallCommand(
  dependencies: readonly InitPlannedDependency[],
  packageManager: NonNullable<Awaited<ReturnType<typeof detectPackageManager>>>["name"],
): string | null {
  const production = dependencies.filter((dependency) => !dependency.dev).map(spec);
  const development = dependencies.filter((dependency) => dependency.dev).map(spec);
  const commands: string[] = [];
  if (production.length > 0) commands.push(addDependencyCommand(packageManager, production));
  if (development.length > 0) {
    commands.push(addDependencyCommand(packageManager, development, { dev: true }));
  }
  return commands.length === 0 ? null : commands.join(" && ");
}

export function createInitPlanPorts(): InitPlanPorts {
  return {
    detect: detectProjectFramework,
    snapshot: createProjectSnapshot,
    adapter(framework) {
      return ADAPTERS[framework];
    },
    hashFile: hashFileBytes,
    async detectPackageManager(root) {
      return (
        (
          await detectPackageManager(root, {
            includeParentDirs: false,
            ignoreArgv: true,
          })
        )?.name ?? null
      );
    },
    installCommand: initInstallCommand,
  };
}

async function install(input: InitInstallInput): Promise<InitInstallResult> {
  const production = input.dependencies.filter((dependency) => !dependency.dev).map(spec);
  const development = input.dependencies.filter((dependency) => dependency.dev).map(spec);
  const batches = [
    ...(production.length === 0 ? [] : [{ names: production, dev: false }]),
    ...(development.length === 0 ? [] : [{ names: development, dev: true }]),
  ];
  const commands: string[] = [];

  for (const batch of batches) {
    const result = await addDependency(batch.names, {
      cwd: input.root,
      packageManager: input.packageManager,
      dev: batch.dev,
      silent: input.interactive,
    });
    if (result.exec !== undefined) {
      commands.push([result.exec.command, ...result.exec.args].join(" "));
    }
  }

  return {
    installed: batches.length > 0,
    command: commands.length > 0 ? commands.join(" && ") : null,
  };
}

function initJournal(): InitWriteJournal {
  const journal = createJournal();
  return {
    write: journal.write,
    destinations() {
      return journal.entries().map((entry) => entry.destination);
    },
    unwind: journal.unwind,
  };
}

export function createInitApplyPorts(): InitApplyPorts {
  return {
    hashFile: hashFileBytes,
    async confirm(request) {
      const changes = request.files.length + request.dependencies.length;
      const answer = await confirm({
        message: `Initialize ${request.framework} with ${changes} planned ${changes === 1 ? "change" : "changes"}?`,
      });
      return { confirmed: answer !== false && answer !== CANCELLED };
    },
    install,
    createJournal: initJournal,
  };
}
