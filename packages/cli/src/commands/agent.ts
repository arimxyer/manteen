import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

import { MANTEEN_AGENT_MANIFEST } from "../agent/manifest";
import type { JsonEnvelope, Streams } from "../cli/render";
import { PROCESS_STREAMS, renderJson, renderThrown } from "../cli/render";

const MARKER_FILE = ".manteen-skill.json";
const MARKER_SCHEMA_VERSION = 1;
const SKILL_SOURCE_CANDIDATES = ["../skill/manteen", "../../skill/manteen"] as const;

export type AgentInstallTarget =
  | "project"
  | "universal-user"
  | "codex-user"
  | "claude-project"
  | "claude-user"
  | "custom";

export interface AgentGuideFlags {
  json?: boolean;
}

export interface AgentInstallFlags {
  cwd: string;
  target?: AgentInstallTarget;
  path?: string;
  dryRun?: boolean;
  json?: boolean;
  update?: boolean;
  takePackaged?: boolean;
}

interface SkillMarker {
  schemaVersion: 1;
  skill: "manteen";
  guideVersion: number;
  files: { path: string; sha256: string }[];
}

interface AgentInstallResult {
  command: "agent install";
  root: string;
  ok: boolean;
  target: AgentInstallTarget;
  destination: string;
  action: "install" | "update" | "already-current" | "refused";
  dryRun: boolean;
  mutated: boolean;
  reason: string | null;
  files: { path: string; sha256: string }[];
  notes: string[];
}

function skillSource(): string {
  for (const candidate of SKILL_SOURCE_CANDIDATES) {
    const directory = resolve(import.meta.dirname, candidate);
    if (existsSync(resolve(directory, "SKILL.md"))) return directory;
  }
  throw new Error(
    `The packaged Manteen skill is missing (looked in ${SKILL_SOURCE_CANDIDATES.join(" and ")} relative to ${import.meta.dirname}).`,
  );
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sha(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function filesIn(directory: string, prefix = ""): { path: string; bytes: Buffer }[] {
  const files: { path: string; bytes: Buffer }[] = [];
  for (const name of readdirSync(directory).sort(byCodeUnit)) {
    if (prefix === "" && name === MARKER_FILE) continue;
    const absolute = resolve(directory, name);
    const state = lstatSync(absolute);
    const path = prefix === "" ? name : `${prefix}/${name}`;
    if (state.isSymbolicLink()) throw new Error(`Skill file ${path} is a symbolic link.`);
    if (state.isDirectory()) files.push(...filesIn(absolute, path));
    else if (state.isFile()) files.push({ path, bytes: readFileSync(absolute) });
    else throw new Error(`Skill file ${path} is not a regular file or directory.`);
  }
  return files.sort((a, b) => byCodeUnit(a.path, b.path));
}

function markerFor(files: readonly { path: string; bytes: Buffer }[]): SkillMarker {
  return {
    schemaVersion: MARKER_SCHEMA_VERSION,
    skill: "manteen",
    guideVersion: MANTEEN_AGENT_MANIFEST.guideVersion,
    files: files.map((file) => ({ path: file.path, sha256: sha(file.bytes) })),
  };
}

function parseMarker(directory: string): SkillMarker | null {
  try {
    const value = JSON.parse(readFileSync(resolve(directory, MARKER_FILE), "utf8")) as SkillMarker;
    if (
      value.schemaVersion !== MARKER_SCHEMA_VERSION ||
      value.skill !== "manteen" ||
      !Array.isArray(value.files) ||
      !value.files.every(
        (file) =>
          typeof file.path === "string" &&
          file.path !== "" &&
          !isAbsolute(file.path) &&
          !file.path.split("/").includes("..") &&
          /^[0-9a-f]{64}$/.test(file.sha256),
      )
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function markerMatchesDisk(directory: string, marker: SkillMarker): boolean {
  let actual: { path: string; bytes: Buffer }[];
  try {
    actual = filesIn(directory);
  } catch {
    return false;
  }
  if (actual.length !== marker.files.length) return false;
  return actual.every(
    (file, index) =>
      file.path === marker.files[index]?.path && sha(file.bytes) === marker.files[index]?.sha256,
  );
}

function markersEqual(left: SkillMarker, right: SkillMarker): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function targetPath(flags: AgentInstallFlags): { target: AgentInstallTarget; destination: string } {
  const root = resolve(flags.cwd);
  const target = flags.target ?? "project";
  const destination = (() => {
    switch (target) {
      case "project":
        return resolve(root, MANTEEN_AGENT_MANIFEST.skill.defaultProjectTarget);
      case "universal-user":
        return resolve(homedir(), ".agents/skills/manteen");
      case "codex-user":
        return resolve(process.env["CODEX_HOME"] ?? resolve(homedir(), ".codex"), "skills/manteen");
      case "claude-project":
        return resolve(root, ".claude/skills/manteen");
      case "claude-user":
        return resolve(homedir(), ".claude/skills/manteen");
      case "custom":
        if (flags.path === undefined) throw new Error("--target custom requires --path <dir>.");
        return resolve(root, flags.path);
    }
  })();
  if (target !== "custom" && flags.path !== undefined) {
    throw new Error("--path is accepted only with --target custom.");
  }
  return { target, destination };
}

function assertSafeDestination(destination: string): void {
  const root = parse(destination).root;
  if (destination === root || destination === homedir() || destination === process.cwd()) {
    throw new Error(`Refusing unsafe skill destination ${destination}.`);
  }
  const segments = relative(root, destination).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) continue;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Refusing skill destination through symbolic link ${cursor}.`);
    }
  }
}

function writeSkill(
  destination: string,
  files: readonly { path: string; bytes: Buffer }[],
  marker: SkillMarker,
): void {
  const parent = dirname(destination);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(resolve(parent, `.${basename(destination)}.manteen-stage-`));
  const backup = `${stage}.backup`;
  let movedExisting = false;
  try {
    for (const file of files) {
      const target = resolve(stage, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.bytes, { flag: "wx" });
    }
    writeFileSync(resolve(stage, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, {
      flag: "wx",
    });
    if (existsSync(destination)) {
      renameSync(destination, backup);
      movedExisting = true;
    }
    renameSync(stage, destination);
    if (movedExisting) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!existsSync(destination) && movedExisting && existsSync(backup)) {
      renameSync(backup, destination);
    }
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export async function runAgentGuide(
  flags: AgentGuideFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  try {
    const source = skillSource();
    const skill = readFileSync(resolve(source, "SKILL.md"), "utf8");
    if (flags.json) {
      streams.stdout(
        renderJson({
          command: "agent guide",
          root: null,
          ok: true,
          manifest: MANTEEN_AGENT_MANIFEST,
          skill,
          references: filesIn(resolve(source, "references")).map((file) => ({
            path: `references/${file.path}`,
            sha256: sha(file.bytes),
          })),
          notes: [],
        } as unknown as JsonEnvelope),
      );
    } else {
      streams.stdout(skill);
    }
    return 0;
  } catch (error) {
    streams.stderr("error  agent-guide\n");
    streams.stderr(renderThrown(error));
    return 1;
  }
}

export async function runAgentInstall(
  flags: AgentInstallFlags,
  streams: Streams = PROCESS_STREAMS,
): Promise<number> {
  let result: AgentInstallResult;
  try {
    const root = resolve(flags.cwd);
    const selected = targetPath(flags);
    assertSafeDestination(selected.destination);
    const sourceFiles = filesIn(skillSource());
    const packaged = markerFor(sourceFiles);
    const existing = existsSync(selected.destination);
    const marker = existing ? parseMarker(selected.destination) : null;
    let action: AgentInstallResult["action"] = existing ? "update" : "install";
    let reason: string | null = null;

    if (existing && marker === null) {
      action = "refused";
      reason = "The destination exists but is not owned by Manteen.";
    } else if (existing && marker !== null && !markerMatchesDisk(selected.destination, marker)) {
      if (!(flags.update && flags.takePackaged)) {
        action = "refused";
        reason =
          "The owned skill has local adaptations. Pass --update --take-packaged only to discard them.";
      }
    } else if (existing && marker !== null && markersEqual(marker, packaged)) {
      action = "already-current";
    } else if (existing && !flags.update) {
      action = "refused";
      reason = "A packaged update is available; pass --update to install it.";
    }

    const ok = action !== "refused";
    const shouldWrite = ok && action !== "already-current" && !flags.dryRun;
    if (shouldWrite) writeSkill(selected.destination, sourceFiles, packaged);
    result = {
      command: "agent install",
      root,
      ok,
      target: selected.target,
      destination: selected.destination,
      action,
      dryRun: flags.dryRun === true,
      mutated: shouldWrite,
      reason,
      files: packaged.files,
      notes: [],
    };
  } catch (error) {
    result = {
      command: "agent install",
      root: resolve(flags.cwd),
      ok: false,
      target: flags.target ?? "project",
      destination: flags.path ?? "",
      action: "refused",
      dryRun: flags.dryRun === true,
      mutated: false,
      reason: error instanceof Error ? error.message : String(error),
      files: [],
      notes: [],
    };
  }

  if (flags.json) streams.stdout(renderJson(result as unknown as JsonEnvelope));
  else if (result.ok) {
    streams.stdout(`${result.action}  ${result.destination}${result.dryRun ? " (dry run)" : ""}\n`);
  } else {
    streams.stderr(`error  agent-install\n  ${result.reason ?? "refused"}\n`);
  }
  return result.ok ? 0 : 1;
}
