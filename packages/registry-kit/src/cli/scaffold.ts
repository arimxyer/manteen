import { resolve } from "node:path";

import { applyScaffold, isScaffoldItemName, planScaffold, ScaffoldError } from "../scaffold";
import { SCAFFOLD_TEMPLATES, type ScaffoldTemplate } from "../scaffold-templates";
import { kitEnvelope, writeJson } from "./json";

export const SCAFFOLD_USAGE = `manteen-kit scaffold --template <template> --name <item> [options]

Plans or applies one new catalog item. Source-only is the default; --register adds
digest-bound surgical catalog, author-profile, and package declaration edits.

Templates:
  component-basic
  component-styles-api
  component-polymorphic

Required modes:
  --dry-run --json
  --apply --expect-plan <sha256> --json

Options:
  --template <template>  explicit scaffold template
  --name <item>          portable strict kebab-case catalog item name
  --catalog <path>       catalog path (default: ./manteen.registry.json)
  --register             include bounded registration edits in the plan/apply
  --dry-run              compute a zero-write plan
  --apply                apply every change from a matching plan
  --expect-plan <sha256> exact digest emitted by an equivalent dry run
  --json                 emit one versioned machine-readable document
`;

interface ScaffoldArgs {
  template: ScaffoldTemplate;
  itemName: string;
  catalogPath: string;
  mode: "dry-run" | "apply";
  expectedPlan: string | null;
  register: boolean;
}

function parseArgs(argv: string[]): ScaffoldArgs | null {
  let template: string | null = null;
  let itemName: string | null = null;
  let catalogPath = "manteen.registry.json";
  let catalogSeen = false;
  let dryRun = false;
  let apply = false;
  let expectedPlan: string | null = null;
  let json = false;
  let register = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) return null;
      index += 1;
      return next;
    };

    if (arg === "--template") {
      if (template !== null) return null;
      template = value();
      if (template === null) return null;
    } else if (arg === "--name") {
      if (itemName !== null) return null;
      itemName = value();
      if (itemName === null) return null;
    } else if (arg === "--catalog") {
      if (catalogSeen) return null;
      catalogSeen = true;
      const next = value();
      if (next === null) return null;
      catalogPath = next;
    } else if (arg === "--expect-plan") {
      if (expectedPlan !== null) return null;
      expectedPlan = value();
      if (expectedPlan === null) return null;
    } else if (arg === "--dry-run") {
      if (dryRun) return null;
      dryRun = true;
    } else if (arg === "--apply") {
      if (apply) return null;
      apply = true;
    } else if (arg === "--json") {
      if (json) return null;
      json = true;
    } else if (arg === "--register") {
      if (register) return null;
      register = true;
    } else {
      return null;
    }
  }

  if (
    !json ||
    template === null ||
    !SCAFFOLD_TEMPLATES.includes(template as ScaffoldTemplate) ||
    itemName === null ||
    !isScaffoldItemName(itemName) ||
    dryRun === apply ||
    (dryRun && expectedPlan !== null) ||
    (apply && expectedPlan === null)
  ) {
    return null;
  }
  return {
    template: template as ScaffoldTemplate,
    itemName,
    catalogPath: resolve(catalogPath),
    mode: dryRun ? "dry-run" : "apply",
    expectedPlan,
    register,
  };
}

export function scaffold(argv: string[]): number {
  if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
    process.stdout.write(SCAFFOLD_USAGE);
    return 0;
  }
  const args = parseArgs(argv);
  if (!args) {
    if (argv.includes("--json")) {
      writeJson(
        kitEnvelope("scaffold", 2, false, null, [
          {
            code: "invalid-arguments",
            message: "Invalid scaffold arguments.",
            details: { usage: SCAFFOLD_USAGE },
          },
        ]),
      );
    } else {
      process.stderr.write(SCAFFOLD_USAGE);
    }
    return 2;
  }

  const input = {
    catalogPath: args.catalogPath,
    template: args.template,
    itemName: args.itemName,
    register: args.register,
  };
  if (args.mode === "dry-run") {
    const plan = planScaffold(input);
    const exitCode = plan.safe ? 0 : 1;
    const applyArgv = ["manteen-kit", "scaffold"];
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index]!;
      if (arg === "--dry-run") {
        applyArgv.push("--apply");
        continue;
      }
      if (arg === "--expect-plan") {
        index += 1;
        continue;
      }
      applyArgv.push(arg);
    }
    applyArgv.push("--expect-plan", plan.planDigest);
    writeJson(
      kitEnvelope(
        "scaffold",
        exitCode,
        false,
        plan,
        plan.diagnostics,
        [],
        exitCode === 0 ? [{ kind: "rerun", argv: applyArgv }] : [],
      ),
    );
    return exitCode;
  }

  try {
    const outcome = applyScaffold(input, args.expectedPlan!);
    writeJson(kitEnvelope("scaffold", 0, outcome.mutated, outcome.plan));
    return 0;
  } catch (error) {
    const diagnostics =
      error instanceof ScaffoldError
        ? error.diagnostics
        : [
            {
              code: "scaffold-apply-failed",
              message: error instanceof Error ? error.message : String(error),
            },
          ];
    writeJson(
      kitEnvelope(
        "scaffold",
        1,
        error instanceof ScaffoldError && error.mutated,
        null,
        diagnostics,
      ),
    );
    return 1;
  }
}
