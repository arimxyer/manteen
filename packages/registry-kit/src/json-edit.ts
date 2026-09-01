/** Strict-JSON edits that preserve every byte outside the selected top-level member. */

function stringEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index + 1;
  }
  throw new Error("JSON contains an unterminated string.");
}

interface MemberRange {
  valueStart: number;
  valueEnd: number;
  indent: string;
}

function topLevelMembers(text: string): Map<string, MemberRange> {
  const members = new Map<string, MemberRange>();
  let depth = 0;
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
              break;
            }
          }
          while (valueEnd > valueStart && /\s/.test(text[valueEnd - 1] ?? "")) valueEnd -= 1;
          const lineStart = text.lastIndexOf("\n", index - 1) + 1;
          const linePrefix = text.slice(lineStart, index);
          members.set(key, {
            valueStart,
            valueEnd,
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
  }
  return members;
}

function formatted(value: unknown, indent: string): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join("\n");
}

export function setTopLevelMember(text: string, member: string, value: unknown): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("JSON root must be an object.");
  }
  const members = topLevelMembers(text);
  const existing = members.get(member);
  if (existing) {
    return `${text.slice(0, existing.valueStart)}${formatted(value, existing.indent)}${text.slice(existing.valueEnd)}`;
  }

  const close = text.lastIndexOf("}");
  if (close < 0) throw new Error("JSON object has no closing brace.");
  const indent = members.values().next().value?.indent ?? "  ";
  const prefix = Object.keys(parsed).length === 0 ? "" : ",";
  return `${text.slice(0, close).trimEnd()}${prefix}\n${indent}${JSON.stringify(member)}: ${formatted(value, indent)}\n${text.slice(close)}`;
}

/** Append one item without reserializing any existing array member or sibling member. */
export function appendTopLevelArrayItem(text: string, member: string, value: unknown): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const current = parsed[member];
  if (current === undefined) return setTopLevelMember(text, member, [value]);
  if (!Array.isArray(current)) throw new Error(`${member} must be an array.`);

  const range = topLevelMembers(text).get(member);
  if (!range) throw new Error(`Could not locate top-level member ${member}.`);
  const valueText = text.slice(range.valueStart, range.valueEnd);
  const closeOffset = valueText.lastIndexOf("]");
  if (closeOffset < 0) throw new Error(`${member} has no closing array bracket.`);
  const close = range.valueStart + closeOffset;
  const itemIndent = `${range.indent}  `;
  const prefix = current.length === 0 ? "" : ",";
  return `${text.slice(0, close).trimEnd()}${prefix}\n${itemIndent}${formatted(value, itemIndent)}\n${range.indent}${text.slice(close)}`;
}
