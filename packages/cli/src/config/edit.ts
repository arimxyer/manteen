/** Bounded strict-JSON edits for top-level manteen.json members. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createJournal } from "../apply/journal";
import { loadRawConfig } from "./load";
import type { MantineConfig } from "./types";

export interface ConfigEditPlan {
  version: 1;
  root: string;
  configPath: string;
  operation: string;
  member: "registries" | "verification";
  preimageSha256: string;
  resultSha256: string;
  planDigest: string;
  changed: boolean;
  /** Apply-only bytes. Command renderers must not expose this field. */
  content: string;
}

export interface ConfigEditOutcome {
  ok: boolean;
  mutated: boolean;
  failure: { kind: "config-plan-stale" | "config-write-failed"; message: string } | null;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stringEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  throw new Error("manteen.json contains an unterminated string.");
}

interface MemberRange {
  propertyStart: number;
  valueStart: number;
  valueEnd: number;
  commaBefore: number | null;
  commaAfter: number | null;
  indent: string;
}

function topLevelMembers(text: string): Map<string, MemberRange> {
  const members = new Map<string, MemberRange>();
  let depth = 0;
  let lastTopLevelComma: number | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      const end = stringEnd(text, index);
      if (depth === 1) {
        const key = JSON.parse(text.slice(index, end)) as string;
        let cursor = end;
        while (/\s/.test(text[cursor] ?? "")) cursor += 1;
        if (text[cursor] === ":") {
          cursor += 1;
          while (/\s/.test(text[cursor] ?? "")) cursor += 1;
          const valueStart = cursor;
          let valueDepth = 0;
          let valueEnd = text.length;
          let commaAfter: number | null = null;
          for (; cursor < text.length; cursor += 1) {
            const valueChar = text[cursor]!;
            if (valueChar === '"') {
              cursor = stringEnd(text, cursor) - 1;
              continue;
            }
            if (valueChar === "{" || valueChar === "[") valueDepth += 1;
            else if (valueChar === "}" || valueChar === "]") {
              if (valueDepth === 0) {
                valueEnd = cursor;
                break;
              }
              valueDepth -= 1;
            } else if (valueChar === "," && valueDepth === 0) {
              valueEnd = cursor;
              commaAfter = cursor;
              break;
            }
          }
          while (valueEnd > valueStart && /\s/.test(text[valueEnd - 1] ?? "")) valueEnd -= 1;
          let propertyStart = index;
          while (propertyStart > 0 && /\s/.test(text[propertyStart - 1] ?? "")) {
            propertyStart -= 1;
          }
          const lineStart = text.lastIndexOf("\n", index - 1) + 1;
          const linePrefix = text.slice(lineStart, index);
          members.set(key, {
            propertyStart,
            valueStart,
            valueEnd,
            commaBefore: lastTopLevelComma,
            commaAfter,
            indent: /^\s*$/.test(linePrefix) ? linePrefix : "  ",
          });
          index = cursor - 1;
          continue;
        }
      }
      index = end - 1;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (char === "," && depth === 1) lastTopLevelComma = index;
  }
  return members;
}

function formatted(value: unknown, indent: string): string {
  const lines = JSON.stringify(value, null, 2).split("\n");
  return lines.map((line, index) => (index === 0 ? line : `${indent}${line}`)).join("\n");
}

export function editTopLevelMember(
  text: string,
  member: "registries" | "verification",
  value: unknown | undefined,
): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("manteen.json must be a JSON object.");
  }
  const members = topLevelMembers(text);
  const existing = members.get(member);
  if (existing !== undefined) {
    if (value !== undefined) {
      return `${text.slice(0, existing.valueStart)}${formatted(value, existing.indent)}${text.slice(existing.valueEnd)}`;
    }
    const start =
      existing.commaAfter !== null
        ? existing.propertyStart
        : existing.commaBefore !== null
          ? existing.commaBefore
          : existing.propertyStart;
    const end = existing.commaAfter !== null ? existing.commaAfter + 1 : existing.valueEnd;
    return `${text.slice(0, start)}${text.slice(end)}`;
  }
  if (value === undefined) return text;

  const close = text.lastIndexOf("}");
  if (close < 0) throw new Error("manteen.json has no closing object brace.");
  const indent = members.values().next().value?.indent ?? "  ";
  const prefix = Object.keys(parsed).length === 0 ? "" : ",";
  return `${text.slice(0, close).trimEnd()}${prefix}\n${indent}${JSON.stringify(member)}: ${formatted(value, indent)}\n${text.slice(close)}`;
}

export function planConfigEdit(
  rootInput: string,
  operation: string,
  member: "registries" | "verification",
  value: unknown | undefined,
): ConfigEditPlan {
  const root = resolve(rootInput);
  const configPath = resolve(root, "manteen.json");
  const before = readFileSync(configPath, "utf8");
  const content = editTopLevelMember(before, member, value);
  const preimageSha256 = sha256(before);
  const resultSha256 = sha256(content);
  const planDigest = sha256(
    JSON.stringify({ version: 1, root, operation, member, preimageSha256, resultSha256 }),
  );
  return {
    version: 1,
    root,
    configPath,
    operation,
    member,
    preimageSha256,
    resultSha256,
    planDigest,
    changed: before !== content,
    content,
  };
}

export function applyConfigEdit(plan: ConfigEditPlan, expectedPlan: string): ConfigEditOutcome {
  let current: Buffer;
  try {
    current = readFileSync(plan.configPath);
  } catch (error) {
    return {
      ok: false,
      mutated: false,
      failure: {
        kind: "config-plan-stale",
        message: `manteen.json could not be re-read before apply: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  if (plan.planDigest !== expectedPlan || sha256(current) !== plan.preimageSha256) {
    return {
      ok: false,
      mutated: false,
      failure: {
        kind: "config-plan-stale",
        message: "manteen.json or the reviewed configuration plan changed; run a new dry-run.",
      },
    };
  }
  if (!plan.changed) return { ok: true, mutated: false, failure: null };
  const journal = createJournal();
  try {
    journal.writeChecked(plan.configPath, plan.preimageSha256, plan.content);
    return { ok: true, mutated: true, failure: null };
  } catch (error) {
    const unwind = journal.unwind();
    return {
      ok: false,
      mutated: !unwind.ok,
      failure: {
        kind: "config-write-failed",
        message: `${error instanceof Error ? error.message : String(error)}${unwind.ok ? " Every config write was restored." : ` Rollback failed: ${unwind.detail ?? "unknown"}.`}`,
      },
    };
  }
}

export function configPreview(plan: ConfigEditPlan) {
  return {
    version: plan.version,
    operation: plan.operation,
    member: plan.member,
    path: "manteen.json",
    preimageSha256: plan.preimageSha256,
    resultSha256: plan.resultSha256,
    changed: plan.changed,
  };
}

export function rawConfig(root: string): MantineConfig {
  const loaded = loadRawConfig(root);
  if (loaded.ok) return loaded.raw;
  throw new Error(
    loaded.errors
      .map(
        (error) =>
          `${error.pointer || "manteen.json"}: ${error.message}${error.hint ? `\n${error.hint}` : ""}`,
      )
      .join("\n"),
  );
}
