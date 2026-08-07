#!/usr/bin/env node
/**
 * The commander program. This file owns exit codes and nothing else of
 * consequence: it loads config, calls `plan()`, prints what came back, calls
 * `apply()`, and prints what happened.
 *
 * PRESENTATION lives in `cli/render.ts` and not here. It used to: `display`,
 * `renderDiagnostic`, `renderConfigError`, `renderThrown`, `renderDryRun` and
 * `renderOutcome` were private to this module, which meant every W5 command
 * either copied them (`info` copied three verbatim) or asked for one to be
 * passed in (`diff` had to — this module has a shebang and RUNS a program on
 * import, so nothing may import it). They are now in a leaf module that all five
 * shells share. What stays here is argv, flags, and the exit code.
 *
 * Exit convention, extending the kit's (`packages/registry-kit/src/cli/index.ts`
 * exits 2 on an unknown command):
 *
 *   0    applied — or a clean `--dry-run`
 *   1    refused (a blocking diagnostic) or failed (a write/install failure)
 *   2    usage, or a config problem found before `plan()` ever ran
 *   130  cancelled at a prompt
 *
 * The split between 1 and 2 is "did we get far enough to have a Plan". Anything
 * `loadConfig` throws is a config problem the user authored, so it is 2; a
 * refusal computed from a Plan is 1.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Command, CommanderError } from "commander";
import { packageManagers } from "nypm";

import { apply } from "../apply/index";
import type { DiffFlags } from "../commands/diff";
import { runDiff } from "../commands/diff";
import type { InfoFlags } from "../commands/info";
import { runInfo } from "../commands/info";
import type { InitFlags } from "../commands/init";
import { runInit } from "../commands/init";
import type { ListFlags } from "../commands/list";
import { runList } from "../commands/list";
import type { UpdateFlags } from "../commands/update";
import { runUpdate } from "../commands/update";
import { blockingExitCode } from "../plan/diagnostics";
import { plan } from "../plan/index";
import type { ApplyOptions, ApplyOutcome, Plan, PlanOptions } from "../plan/types";
import { interactiveFromProcess } from "../ui";
import {
  loadProjectConfig,
  PROCESS_STREAMS,
  renderApplyFailure,
  renderDiagnostics,
  renderDryRun,
  renderOutcome,
  renderThrown,
  renderUpdateStateAdvisory,
} from "./render";

const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const EXIT_USAGE = 2;
const EXIT_CANCELLED = 130;

/**
 * `../package.json` is correct because the dist is FLAT — `dist/cli.mjs` sits
 * one level below the package root, the same invariant that makes
 * `resolve(import.meta.dirname, "../schema/...")` work. Nesting the entry under
 * `dist/cli/` would repoint this at `dist/package.json` and throw here first.
 */
const { version } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
) as { version: string };

/** Derived from nypm rather than hardcoded, so a new manager arrives with an upgrade. */
const PACKAGE_MANAGER_NAMES: string[] = [...new Set(packageManagers.map((pm) => pm.name))];

// ---- add --------------------------------------------------------------------

interface AddFlags {
  cwd: string;
  dryRun?: boolean;
  force?: boolean;
  /** `undefined` until commander says the user typed one of the two spellings;
   *  `false` means `--no-overwrite`. See the `getOptionValueSource` note below. */
  overwrite?: boolean;
  yes?: boolean;
  /** D15's detection override. The `no-package-manager` refusal names this flag,
   *  so it has to exist — an error that points at a flag you cannot pass is worse
   *  than no advice at all. */
  pm?: string;
}

async function runAdd(refs: string[], flags: AddFlags, command: Command): Promise<number> {
  if (refs.length === 0) {
    process.stderr.write(
      "manteen add: name at least one item, e.g. `manteen add @house/data-table`.\n\n",
    );
    process.stderr.write(command.helpInformation());
    return EXIT_USAGE;
  }

  /**
   * Three states out of two flags. Commander presets `overwrite` to `true` when
   * `--no-overwrite` is declared alone, so the option's VALUE cannot distinguish
   * "defaulted" from "typed" — the source can, and it is the only reading that
   * survives however commander orders its defaults.
   *
   * D14: `--yes` implies `--overwrite`, but an explicit `--no-overwrite` wins.
   * Without the implication, `--yes` would make the run non-interactive with no
   * overwrite answer, which is precisely the state §1's refusal table exits 1 on
   * — `--yes` meaning "refuse" is the opposite of what it says.
   */
  const typedOverwrite = command.getOptionValueSource("overwrite") === "cli";
  const overwrite: PlanOptions["overwrite"] = typedOverwrite
    ? flags.overwrite === false
      ? "no"
      : true
    : flags.yes
      ? true
      : undefined;

  const interactive = interactiveFromProcess({ yes: Boolean(flags.yes) });

  // `loadProjectConfig` is the shared implementation of the exit-2 boundary:
  // `loadConfig` reports authored problems by RETURNING (there can be several at
  // once — three unbacked aliases are three edits) while an EACCES on
  // `tsconfig.json` still throws, and both are 2 because both happened before
  // there was a Plan to refuse. All five shells go through it, so a config
  // failure looks the same whichever command hit it.
  const loaded = loadProjectConfig(flags.cwd, PROCESS_STREAMS.stderr);
  if (!loaded.ok) return loaded.exit;
  const config = loaded.config;

  // Validated here rather than in `plan()` because an unknown name is a usage
  // error, and nypm would otherwise take it as far as building an unrunnable
  // command string — `addDependencyCommand(undefined, …)` returns "add --dev x",
  // a command with no binary in front of it.
  if (flags.pm !== undefined && !PACKAGE_MANAGER_NAMES.includes(flags.pm)) {
    process.stderr.write(
      `manteen add: --pm ${flags.pm} is not a package manager manteen knows. ` +
        `Expected one of: ${PACKAGE_MANAGER_NAMES.join(", ")}.\n`,
    );
    return EXIT_USAGE;
  }

  const planOptions: PlanOptions = {
    force: flags.force,
    overwrite,
    interactive,
    packageManager: flags.pm as PlanOptions["packageManager"],
  };

  let planned: Plan;
  try {
    planned = await plan(config, refs, planOptions);
  } catch (error) {
    process.stderr.write("error  plan\n");
    process.stderr.write(renderThrown(error));
    return EXIT_REFUSED;
  }

  renderDiagnostics(planned.diagnostics, planned.root, PROCESS_STREAMS.stderr);

  // `plan.ok` already has --force folded in; apply() reads it and never
  // re-derives a verdict, so neither does the shell. The exit CODE is a separate
  // question from the verdict: §1's table puts `no-package-manager` at 2, not 1,
  // because it names the thing the user has to fix first. `force: false` here is
  // correct rather than a dropped flag — `plan.diagnostics` has already been
  // downgraded by the aggregator, so re-applying it would forgive a second time.
  if (!planned.ok)
    return blockingExitCode(planned.diagnostics, false) === 2 ? EXIT_USAGE : EXIT_REFUSED;

  const applyOptions: ApplyOptions = { interactive, overwrite, dryRun: flags.dryRun };

  let outcome: ApplyOutcome;
  try {
    outcome = await apply(planned, applyOptions);
  } catch (error) {
    process.stderr.write("error  apply\n");
    process.stderr.write(renderThrown(error));
    return EXIT_REFUSED;
  }

  if (outcome.cancelled) return EXIT_CANCELLED;

  // Branch on the flag WE passed in, not on `outcome.dryRun`. That field is
  // apply()'s echo of the same value, and if it is ever left unset a dry run
  // silently renders `WriteResult`s for writes that never happened — output
  // that reads as a real install.
  process.stdout.write(flags.dryRun ? renderDryRun(planned) : renderOutcome(outcome, planned.root));

  process.stderr.write(renderApplyFailure(outcome, planned.root));
  process.stderr.write(renderUpdateStateAdvisory(outcome, planned));

  return outcome.ok ? EXIT_OK : EXIT_REFUSED;
}

// ---- program ----------------------------------------------------------------

const program = new Command()
  .name("manteen")
  .description("Install Mantine components from a registry into your project.")
  // Commander's default is `-V, --version`. Left alone on purpose: `-v` is
  // reserved for `--verbose`, which phase 4 adds and which users type far more.
  .version(version)
  .showHelpAfterError()
  // Must precede `.command()`: a subcommand copies the exit callback from its
  // parent at CREATION time (`copyInheritedSettings`), so calling this after the
  // `add` command is built leaves `add`'s own usage errors exiting commander's
  // default 1 instead of our 2.
  .exitOverride();

/**
 * `add`'s non-interactive overwrite boundary. Update computes a three-way
 * result during planning and therefore does not use this gate.
 *
 * The surprising half is `--dry-run`. Nobody expects the flag that means "just
 * show me" to need write authorisation, but `destination-exists` is a PLAN-time
 * refusal and `--dry-run` only suppresses the writing — `dryRun` lives on
 * `ApplyOptions`, which `plan()` never sees. So the preview refuses for exactly
 * the reason the real run would, which is defensible, and completely opaque
 * unless it is written down.
 *
 * Pointing at `diff` is the actually useful part of this text: it answers the
 * question the person is really asking, needs no flag, and cannot write.
 */
const NON_INTERACTIVE_HELP = `
NON-INTERACTIVE (CI, or any run with no terminal attached):
  A destination that already exists with different content is a refusal here,
  not a prompt — including under --dry-run, because the check runs while
  planning and --dry-run only skips the writing.

  Pass --overwrite to replace those files, or --no-overwrite to keep them.
  Either one also makes --dry-run print the preview instead of refusing.

  To see what would change without deciding anything, use \`manteen diff\`.
  It needs no flags, writes nothing, and exits 0 when there is nothing to do.
`;

program
  .command("init")
  .description("configure Mantine and manteen for the detected project framework")
  .option("--cwd <dir>", "project directory to initialize", process.cwd())
  .option("--dry-run", "plan and preflight only; prompt for and write nothing")
  .option("--force", "downgrade forceable refusals to warnings; never silences them")
  .option("-y, --yes", "apply without the all-or-nothing confirmation")
  .option("--json", "emit the plan, outcome, diagnostics and required work as one JSON document")
  .option(
    "--framework <name>",
    "select vite, next-app, next-pages, next-hybrid, react-router or manual",
  )
  .option("--pm <name>", "override package-manager detection (npm, pnpm, yarn, bun, deno)")
  .action(async (flags: InitFlags) => {
    process.exitCode = await runInit(flags);
  });

program
  .command("add")
  .description("install one or more registry items")
  .argument("[refs...]", "qualified item names, e.g. @house/data-table")
  .option("--cwd <dir>", "project directory containing manteen.json", process.cwd())
  .option("--dry-run", "plan and preflight only; write nothing (see NON-INTERACTIVE)")
  .option("--force", "downgrade forceable refusals to warnings; never silences them")
  .option("--overwrite", "replace existing files without asking")
  .option("--no-overwrite", "keep existing files without asking")
  .option("-y, --yes", "assume yes at every prompt; implies --overwrite")
  .option("--pm <name>", "override package-manager detection (npm, pnpm, yarn, bun, deno)")
  .addHelpText("after", NON_INTERACTIVE_HELP)
  .action(async (refs: string[], flags: AddFlags, command: Command) => {
    process.exitCode = await runAdd(refs, flags, command);
  });

/**
 * The four read-and-maintain commands.
 *
 * Registered AFTER `.exitOverride()` for the reason stated on it: a subcommand
 * copies the exit callback from its parent at CREATION time, so a command built
 * before that call would exit commander's default 1 on its own usage errors
 * instead of our 2. Order among the four is presentational only.
 *
 * `--cwd` carries commander's `process.cwd()` default on every one of them. It
 * is not decoration: each `run*` takes a REQUIRED `cwd: string` and
 * `resolve(undefined)` throws, so an omitted default is a crash on the bare
 * invocation rather than a defaulted one.
 *
 * The bodies live in `src/commands/`; nothing below does more than name flags
 * and hand the exit code to `process.exitCode`.
 */

program
  .command("list")
  .description("list what the configured registries offer, and what is installed")
  .argument("[namespaces...]", "limit the listing to these registries, e.g. @house")
  .option("--cwd <dir>", "project directory containing manteen.json", process.cwd())
  .option("--json", "emit the listing and its notes as one JSON document")
  .action(async (namespaces: string[], flags: ListFlags) => {
    process.exitCode = await runList(namespaces, flags);
  });

program
  .command("info")
  .description("show everything known about one registry item")
  .argument("<ref>", "a qualified item name, e.g. @house/data-table")
  .option("--cwd <dir>", "project directory containing manteen.json", process.cwd())
  .option("--json", "emit the report as one JSON document")
  .action(async (ref: string, flags: InfoFlags) => {
    process.exitCode = await runInfo(ref, flags);
  });

program
  .command("diff")
  .description("compare installed files against the registry and against what manteen wrote")
  .argument("[refs...]", "item ids to compare; omit for every installed item")
  .option("--cwd <dir>", "project directory containing manteen.json", process.cwd())
  .option("--json", "emit the comparison as one JSON document")
  .option("--stat", "summary only; compute no patches")
  .action(async (refs: string[], flags: DiffFlags) => {
    process.exitCode = await runDiff(refs, flags);
  });

program
  .command("update")
  .description("re-fetch installed items and re-apply them")
  .argument("[refs...]", "item ids to update; omit for every directly-installed item")
  .option("--cwd <dir>", "project directory containing manteen.json", process.cwd())
  .option("--all", "also update items installed only as dependencies; promotes them to direct")
  .option("--dry-run", "plan and preflight only; write nothing (see NON-INTERACTIVE)")
  .option("--force", "downgrade forceable refusals to warnings; never silences them")
  .option("--json", "emit the result as one JSON document")
  .option("--take-upstream", "discard local adaptations and restore current upstream files")
  .option("--no-verify", "skip configured post-update package scripts")
  .option("--pm <name>", "override package-manager detection (npm, pnpm, yarn, bun, deno)")
  .action(async (refs: string[], flags: UpdateFlags, command: Command) => {
    process.exitCode = await runUpdate(refs, flags, command);
  });

/**
 * No root `.action()` on purpose. Registering one makes commander route an
 * unknown command INTO it rather than raising `unknownCommand`, so `manteen
 * bogus` would print help with no mention of `bogus`. Left alone, commander
 * names the bad command and raises — and `exitOverride` turns both that and the
 * bare-invocation help into a throw we map to 2, which is the kit's convention.
 */
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    // `--help` and `--version` also throw under exitOverride, with exitCode 0.
    process.exit(error.exitCode === 0 ? EXIT_OK : EXIT_USAGE);
  }
  throw error;
}
