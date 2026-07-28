#!/usr/bin/env node
/**
 * The commander program. This file owns exit codes and nothing else of
 * consequence: it loads config, calls `plan()`, prints what came back, calls
 * `apply()`, and prints what happened.
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
import { relative, resolve, sep } from "node:path";

import { Command, CommanderError } from "commander";
import { packageManagers } from "nypm";

import { apply } from "../apply/index";
import { loadConfig } from "../config/load";
import type { ConfigError } from "../config/types";
import { blockingExitCode } from "../plan/diagnostics";
import { plan } from "../plan/index";
import type {
  ApplyOptions,
  ApplyOutcome,
  Diagnostic,
  Plan,
  PlanOptions,
} from "../plan/types";
import { interactiveFromProcess } from "../ui";

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

// ---- rendering --------------------------------------------------------------
// Deliberately private. `gates/report.ts` and `apply/report.ts` own aggregation
// (computing `ok`, ordering diagnostics); presentation is the shell's job and
// lives where the streams are chosen. If either of those grows a renderer, these
// three functions are what it replaces.

/**
 * Root-relative and POSIX, so output is identical on Windows.
 *
 * `Diagnostic.path` carries either a filesystem path or a registry URL, and
 * path logic mangles the latter — `relative()` collapses `https://` into
 * `https:/`, so a `fetch-failed` printed a URL that 404s when copy-pasted.
 */
function display(pathOrUrl: string, root: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return relative(root, pathOrUrl).split(sep).join("/");
}

/**
 * `severity  code  ids` on the first line, then path and message indented.
 *
 * The code is printed rather than only the prose because it is the stable
 * handle: e2e assertions and user bug reports both grep for `target-collision`,
 * and `Diagnostic.message` is free to be reworded.
 */
function renderDiagnostic(diagnostic: Diagnostic, root: string): string {
  const ids = diagnostic.items?.length ? `  ${diagnostic.items.join(", ")}` : "";
  const lines = [`${diagnostic.severity}  ${diagnostic.code}${ids}`];
  if (diagnostic.path) lines.push(`  ${display(diagnostic.path, root)}`);
  for (const line of diagnostic.message.split("\n")) lines.push(`  ${line}`);
  return `${lines.join("\n")}\n`;
}

/** Widest verb in either vocabulary — `identical`, `overwrite`, `unchanged`. */
const VERB_WIDTH = 9;

/**
 * What `--dry-run` prints: `Disposition`, which is what plan() PREDICTED.
 *
 * Read off the Plan rather than off `ApplyOutcome.files`, because under D19 the
 * outcome's `WriteResult` describes writes that were never attempted.
 */
function renderDryRun(planned: Plan): string {
  const lines = planned.files.map(
    (file) => `${file.disposition.padEnd(VERB_WIDTH)}  ${display(file.destination, planned.root)}`,
  );
  if (planned.theme) {
    const verb = planned.theme.changed ? "merge" : "unchanged";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${display(planned.theme.destination, planned.root)}`);
  }
  lines.push("", "Dry run — nothing was written.");
  return `${lines.join("\n")}\n`;
}

/** What a real run prints: `WriteResult`, which is what apply() OBSERVED. */
function renderOutcome(outcome: ApplyOutcome, root: string): string {
  const lines = outcome.files.map(
    (file) => `${file.result.padEnd(VERB_WIDTH)}  ${display(file.destination, root)}`,
  );
  if (outcome.theme) {
    const verb = outcome.theme.written ? "written" : "unchanged";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${display(outcome.theme.path, root)}`);
  }
  if (outcome.receipt.written) {
    lines.push(`${"written".padEnd(VERB_WIDTH)}  ${display(outcome.receipt.path, root)}`);
  }
  if (outcome.dependencies.command) {
    const verb = outcome.dependencies.installed ? "installed" : "skipped";
    lines.push(`${verb.padEnd(VERB_WIDTH)}  ${outcome.dependencies.command}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

/**
 * Same three-part head as a diagnostic — `severity  subject  where` — so config
 * failures and plan failures read alike. `hint` is separated by a blank line
 * because it is the user's next action, not more description of the problem.
 */
function renderConfigError(error: ConfigError): string {
  // `pointer` is a JSON Pointer (`/aliases/ui`) and is the empty string when the
  // problem is the file as a whole, which would otherwise print a dangling head.
  const lines = [error.pointer ? `error  config  ${error.pointer}` : "error  config"];
  for (const line of error.message.split("\n")) lines.push(`  ${line}`);
  if (error.hint) {
    lines.push("");
    for (const line of error.hint.split("\n")) lines.push(`  ${line}`);
  }
  return `${lines.join("\n")}\n`;
}

/** A throw, as opposed to a returned failure — a bug, or an fs error nobody anticipated. */
function renderThrown(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${message
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}\n`;
}

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
    process.stderr.write("manteen add: name at least one item, e.g. `manteen add @house/data-table`.\n\n");
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
  const root = resolve(flags.cwd);

  /**
   * `loadConfig` reports failure by returning, not by throwing — every problem
   * it can find is one the user authored, and there can be several at once
   * (three unbacked aliases are three edits). The try/catch is for the other
   * kind: an EACCES on `tsconfig.json`, or a bug. Both are still exit 2, because
   * both happened before there was a Plan to refuse.
   */
  let loaded;
  try {
    loaded = loadConfig(root);
  } catch (error) {
    process.stderr.write("error  config\n");
    process.stderr.write(renderThrown(error));
    return EXIT_USAGE;
  }

  if (!loaded.ok) {
    for (const configError of loaded.errors) process.stderr.write(renderConfigError(configError));
    return EXIT_USAGE;
  }

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

  for (const diagnostic of planned.diagnostics) {
    process.stderr.write(renderDiagnostic(diagnostic, planned.root));
  }

  // `plan.ok` already has --force folded in; apply() reads it and never
  // re-derives a verdict, so neither does the shell. The exit CODE is a separate
  // question from the verdict: §1's table puts `no-package-manager` at 2, not 1,
  // because it names the thing the user has to fix first. `force: false` here is
  // correct rather than a dropped flag — `plan.diagnostics` has already been
  // downgraded by the aggregator, so re-applying it would forgive a second time.
  if (!planned.ok) return blockingExitCode(planned.diagnostics, false) === 2 ? EXIT_USAGE : EXIT_REFUSED;

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

  if (outcome.failure) {
    process.stderr.write(`error  ${outcome.failure.kind}\n`);
    for (const line of outcome.failure.message.split("\n")) {
      process.stderr.write(`  ${line}\n`);
    }
    for (const path of outcome.failure.paths ?? []) {
      process.stderr.write(`  ${display(path, planned.root)}\n`);
    }
  }

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

program
  .command("add")
  .description("install one or more registry items")
  .argument("[refs...]", "qualified item names, e.g. @house/data-table")
  .option("--cwd <dir>", "project directory containing manteen.json", process.cwd())
  .option("--dry-run", "plan and preflight only; write nothing")
  .option("--force", "downgrade forceable refusals to warnings; never silences them")
  .option("--overwrite", "replace existing files without asking")
  .option("--no-overwrite", "keep existing files without asking")
  .option("-y, --yes", "assume yes at every prompt; implies --overwrite")
  .option("--pm <name>", "override package-manager detection (npm, pnpm, yarn, bun, deno)")
  .action(async (refs: string[], flags: AddFlags, command: Command) => {
    process.exitCode = await runAdd(refs, flags, command);
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
