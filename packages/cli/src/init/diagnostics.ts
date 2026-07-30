/** W6 diagnostic constructors. Pure: no fs, env, process or clock. */
import { diag } from "../plan/diagnostics";
import type { Diagnostic } from "../plan/types";
import type { InitFrameworkFlag } from "./types";

export function initFrameworkUnrecognized(root: string): Diagnostic {
  return diag(
    "init-framework-unrecognized",
    `No supported framework could be identified in ${root}. Pass --framework manual to write the shared config and theme scaffold with explicit integration instructions.`,
    { path: root },
  );
}

export function initFrameworkAmbiguous(
  root: string,
  candidates: readonly InitFrameworkFlag[],
): Diagnostic {
  return diag(
    "init-framework-ambiguous",
    `Framework detection in ${root} matched incompatible candidates: ${candidates.join(", ")}. Re-run with one explicit --framework value.`,
    { path: root },
  );
}

export function initFrameworkMismatch(
  root: string,
  requested: InitFrameworkFlag,
  detail: string,
): Diagnostic {
  return diag(
    "init-framework-mismatch",
    `--framework ${requested} contradicts the project in ${root}: ${detail} The override selects among valid shapes; it does not authorize inventing missing framework entry files.`,
    { path: root },
  );
}

export function initConfigConflict(path: string, detail: string): Diagnostic {
  return diag(
    "init-config-conflict",
    `${path} has an explicit value that init cannot merge safely: ${detail} Resolve it manually, then re-run manteen init.`,
    { path },
  );
}

export function initSourceUnsupported(path: string, detail: string): Diagnostic {
  return diag(
    "init-source-unsupported",
    `${path} is recognized but cannot be transformed without guessing: ${detail} Apply the documented Mantine integration there manually, or restore a supported static entry shape and re-run.`,
    { path },
  );
}

export function initPostcssUnsupported(path: string, detail: string): Diagnostic {
  return diag(
    "init-postcss-unsupported",
    `${path} is the active PostCSS configuration, but init cannot preserve its executable shape: ${detail} Add the printed Mantine plugin block manually; init will not create a competing config file.`,
    { path },
  );
}

export function initPathEscapesRoot(root: string, path: string): Diagnostic {
  return diag(
    "init-path-escapes-root",
    `Init resolved ${path} outside the project root ${root}. Nothing was written; use paths that stay inside the project.`,
    { path },
  );
}
