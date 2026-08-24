import semver, { Range } from "semver";

import type { MantineItem, MantineRegistry } from "./build-registry";

export type MantineRangeFailureCode =
  | "mantine-range-invalid"
  | "mantine-gate-missing"
  | "mantine-ranges-disjoint"
  | "mantine-dependency-outside-gate"
  | "house-mantine-range-unsupported";

export interface MantineRangeFailure {
  code: MantineRangeFailureCode;
  item: string;
  message: string;
  details?: Record<string, unknown>;
}

export class MantineRangeError extends Error {
  constructor(readonly failures: MantineRangeFailure[]) {
    super(failures.map((failure) => failure.message).join("\n"));
    this.name = "MantineRangeError";
  }
}

const HOUSE_NAMESPACE = "@house";
const HOUSE_MANTINE_BAND = ">=9.5.0 <10";

interface MantineDependencyRange {
  packageName: string;
  range: string;
}

function mantineDependencies(item: MantineItem): MantineDependencyRange[] {
  return (item.npm ?? []).flatMap((spec) => {
    if (!spec.startsWith("@mantine/")) return [];
    const separator = spec.indexOf("@", 1);
    return [
      {
        packageName: separator === -1 ? spec : spec.slice(0, separator),
        range: separator === -1 ? "" : spec.slice(separator + 1),
      },
    ];
  });
}

function parseRange(
  range: string,
  item: string,
  subject: string,
  failures: MantineRangeFailure[],
): Range | null {
  try {
    // semver deliberately treats an empty string as `*`; a catalog gate or
    // dependency directive cannot use that shorthand without silently claiming
    // every Mantine release.
    if (range.trim().length === 0 || !semver.validRange(range)) {
      throw new TypeError("not a valid semver range");
    }
    return new Range(range);
  } catch {
    failures.push({
      code: "mantine-range-invalid",
      item,
      message: `Item \`${item}\` has an invalid Mantine range for ${subject}.`,
      details: { subject, range },
    });
    return null;
  }
}

/**
 * semver ranges are unions of comparator sets. A common intersection exists
 * when one set from every range can be combined into a satisfiable range.
 */
function haveCommonIntersection(ranges: Range[]): boolean {
  const visit = (index: number, comparators: string[]): boolean => {
    if (index === ranges.length) {
      try {
        return semver.minVersion(new Range(comparators.join(" "))) !== null;
      } catch {
        return false;
      }
    }
    return ranges[index]!.set.some((set) =>
      visit(
        index + 1,
        comparators.concat(set.map((comparator) => comparator.value).filter(Boolean)),
      ),
    );
  };

  return visit(0, []);
}

export function inspectMantineRanges(source: MantineRegistry): MantineRangeFailure[] {
  const failures: MantineRangeFailure[] = [];

  for (const item of source.items) {
    const dependencies = mantineDependencies(item);
    const gate =
      item.mantine === undefined
        ? null
        : parseRange(item.mantine, item.name, "the `mantine` gate", failures);
    const dependencyRanges = dependencies.flatMap((dependency) => {
      const parsed = parseRange(
        dependency.range,
        item.name,
        `dependency \`${dependency.packageName}\``,
        failures,
      );
      return parsed ? [{ ...dependency, parsed }] : [];
    });

    if (dependencies.length > 0 && item.mantine === undefined) {
      failures.push({
        code: "mantine-gate-missing",
        item: item.name,
        message: `Item \`${item.name}\` declares an @mantine/* runtime dependency without a \`mantine\` gate.`,
      });
    }

    if (
      dependencyRanges.length > 1 &&
      !haveCommonIntersection(dependencyRanges.map(({ parsed }) => parsed))
    ) {
      failures.push({
        code: "mantine-ranges-disjoint",
        item: item.name,
        message: `Item \`${item.name}\` has @mantine/* runtime ranges with no common version band.`,
        details: {
          dependencies: dependencyRanges.map(({ packageName, range }) => ({ packageName, range })),
        },
      });
    }

    if (gate) {
      for (const dependency of dependencyRanges) {
        if (!semver.subset(dependency.parsed, gate)) {
          failures.push({
            code: "mantine-dependency-outside-gate",
            item: item.name,
            message: `Item \`${item.name}\` dependency \`${dependency.packageName}\` is not contained by its \`mantine\` gate.`,
            details: {
              dependency: dependency.packageName,
              range: dependency.range,
              gate: item.mantine,
            },
          });
        }
      }

      if (
        source.namespace === HOUSE_NAMESPACE &&
        (!semver.subset(gate, HOUSE_MANTINE_BAND) || !semver.subset(HOUSE_MANTINE_BAND, gate))
      ) {
        failures.push({
          code: "house-mantine-range-unsupported",
          item: item.name,
          message: `House item \`${item.name}\` must stay within the supported Mantine band \`${HOUSE_MANTINE_BAND}\`.`,
          details: { gate: item.mantine, supported: HOUSE_MANTINE_BAND },
        });
      }
    }
  }

  return failures;
}
