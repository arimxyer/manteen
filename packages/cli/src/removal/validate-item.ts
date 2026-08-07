/**
 * D42's deliberately narrow item view.
 *
 * The wire document, registryDependencies and ordinary file targets matter to
 * removal. npm dependencies, CSS, provider/version metadata and theme
 * fragments do not, so this validator never interprets them and cannot emit
 * their add/update diagnostics.
 */
import { createWireValidator } from "manteen-kit";

import { diag } from "../plan/diagnostics";
import type { ItemValidator, ValidatedItem, WireFile } from "../plan/validate-item";

interface RemovalWireDoc {
  name: string;
  type: string;
  registryDependencies?: string[];
  files?: { path: string; type: string; target?: string; content?: unknown }[];
}

export function createRemovalItemValidator(): ItemValidator {
  const validateWire = createWireValidator();

  return (doc, context) => {
    const wireErrors = validateWire(doc);
    if (wireErrors !== null) {
      return {
        ok: false,
        diagnostics: [
          diag(
            "wire-invalid",
            `${context.id} is not a valid registry item (${context.redactedUrl}): ${summarise(wireErrors)}`,
            { items: [context.id] },
          ),
        ],
      };
    }

    const wire = doc as RemovalWireDoc;
    if (wire.type === "registry:font") {
      return {
        ok: false,
        diagnostics: [
          diag(
            "target-refused-type",
            `${context.id} is a registry:font item. It has no ordinary files that Manteen can map for upstream removal.`,
            { items: [context.id] },
          ),
        ],
      };
    }

    const diagnostics = [];
    const files: WireFile[] = [];
    for (const file of wire.files ?? []) {
      if (typeof file.content !== "string" || file.content === "") {
        diagnostics.push(
          diag(
            "file-no-content",
            `${context.id} ships "${file.path}" with no content, so its current ordinary-file mapping cannot be proven.`,
            { items: [context.id], path: file.path },
          ),
        );
        continue;
      }
      files.push({
        path: file.path,
        type: file.type,
        ...(file.target === undefined ? {} : { target: file.target }),
        content: file.content,
      });
    }

    if (nameMismatch(context.expectedName, wire.name)) {
      diagnostics.push(
        diag(
          "name-mismatch",
          `${context.id} resolved to an item named "${wire.name}" (${context.redactedUrl}). Its canonical receipt id remains the removal owner.`,
          { items: [context.id] },
        ),
      );
    }

    const item: ValidatedItem = {
      name: wire.name,
      wireType: wire.type,
      files,
      dependencies: [],
      devDependencies: [],
      registryDependencies: wire.registryDependencies ?? [],
      cssImports: [],
      meta: {},
    };
    return { ok: true, item, diagnostics };
  };
}

function nameMismatch(expected: string | null, actual: string): boolean {
  if (expected === null || expected === actual) return false;
  return expected.slice(expected.lastIndexOf("/") + 1) !== actual;
}

const MAX_REPORTED = 5;

function summarise(messages: readonly string[]): string {
  const head = messages.slice(0, MAX_REPORTED).join("; ");
  const rest = messages.length - MAX_REPORTED;
  return rest > 0 ? `${head}; +${rest} more` : head;
}
