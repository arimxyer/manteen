import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const itemNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const registryTypePattern = /^registry:[a-z][a-z0-9-]*$/;
const channelOrder = ["defaultProps", "classNames", "styles", "vars"] as const;

const nonEmptyString = z.string().min(1);
const itemName = z.string().regex(itemNamePattern, "must be a safe lowercase item name");
const registryType = z.string().regex(registryTypePattern, "must be a registry:* type");
const printableLine = z
  .string()
  .min(1)
  .refine(
    (value) =>
      [...value].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 32 && codePoint !== 127;
      }),
    "must be a non-empty single-line string",
  );

const indexMantineSchema = z
  .object({
    requires: nonEmptyString.optional(),
    provider: nonEmptyString.optional(),
  })
  .strict();

const indexMetaSchema = z
  .object({
    mantine: indexMantineSchema,
  })
  .strict();

const indexItemSchema = z
  .object({
    name: itemName,
    type: registryType,
    title: nonEmptyString,
    description: nonEmptyString,
    meta: indexMetaSchema.optional(),
  })
  .strict();

const registryIndexSchema = z
  .object({
    $schema: nonEmptyString.optional(),
    name: nonEmptyString,
    homepage: z.string().url().optional(),
    items: z.array(indexItemSchema).min(1),
  })
  .strict();

const sourceDocumentSchema = z
  .object({
    path: nonEmptyString,
    content: z.string(),
  })
  .strict();

const propSchema = z
  .object({
    name: nonEmptyString,
    type: nonEmptyString,
    required: z.boolean().optional(),
    default: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

const themeChannelSchema = z
  .object({
    name: z.enum(channelOrder),
    dynamic: z.boolean(),
  })
  .strict();

const themeComponentSchema = z
  .object({
    name: z.string(),
    channels: z.array(themeChannelSchema),
    dynamic: z.boolean(),
  })
  .strict();

const themeSummarySchema = z
  .object({
    keys: z.array(z.string()),
    components: z
      .object({
        items: z.array(themeComponentSchema),
        dynamic: z.boolean(),
      })
      .strict(),
    dynamic: z.boolean(),
  })
  .strict();

const mantineMetaSchema = z
  .object({
    requires: nonEmptyString.optional(),
    provider: nonEmptyString.optional(),
    stylesApi: z.record(nonEmptyString, z.array(nonEmptyString).min(1)).optional(),
    props: z.record(nonEmptyString, z.array(propSchema).min(1)).optional(),
    usage: sourceDocumentSchema.optional(),
    themeFragment: sourceDocumentSchema.optional(),
    themeSummary: themeSummarySchema.optional(),
  })
  .strict();

const detailMetaSchema = z
  .object({
    mantine: mantineMetaSchema,
  })
  .strict();

const compiledFileSchema = z
  .object({
    path: nonEmptyString,
    type: registryType,
    target: printableLine.optional(),
    content: z.string(),
  })
  .strict();

type CssValue = string | { [key: string]: CssValue };
const cssValueSchema: z.ZodType<CssValue> = z.lazy(() =>
  z.union([z.string(), z.record(z.string(), cssValueSchema)]),
);

const registryDetailSchema = z
  .object({
    $schema: nonEmptyString.optional(),
    name: itemName,
    type: registryType,
    title: nonEmptyString,
    description: nonEmptyString,
    docs: z.string().optional(),
    files: z.array(compiledFileSchema).min(1),
    dependencies: z.array(printableLine).optional(),
    registryDependencies: z.array(printableLine).optional(),
    css: z.record(nonEmptyString, cssValueSchema).optional(),
    meta: detailMetaSchema.optional(),
  })
  .strict();

export type RegistryIndexItem = z.infer<typeof indexItemSchema>;
export type RegistryItem = z.infer<typeof registryDetailSchema>;
export type RegistryTypeGroup = {
  type: string;
  items: RegistryItem[];
};

export type CompiledRegistry = {
  name: string;
  homepage?: string;
  items: RegistryItem[];
  groups: RegistryTypeGroup[];
  getItem(name: string): RegistryItem | undefined;
};

export type ReadCompiledRegistryOptions = {
  directory?: string;
};

let defaultRegistryPromise: Promise<CompiledRegistry> | undefined;

export function readCompiledRegistry(
  options: ReadCompiledRegistryOptions = {},
): Promise<CompiledRegistry> {
  if (options.directory) return readRegistryDirectory(resolve(options.directory));

  defaultRegistryPromise ??= readRegistryDirectory(resolve(process.cwd(), "../../public/r"));
  return defaultRegistryPromise;
}

async function readRegistryDirectory(directory: string): Promise<CompiledRegistry> {
  const indexPath = resolve(directory, "registry.json");
  const index = parseDocument(
    registryIndexSchema,
    await readDocument(indexPath, "compiled registry index"),
    indexPath,
  );

  assertUnique(
    index.items.map((item) => item.name),
    "registry index item names",
    indexPath,
  );

  const items = await Promise.all(
    index.items.map(async (indexedItem) => {
      const detailPath = resolve(directory, `${indexedItem.name}.json`);
      const detail = parseDocument(
        registryDetailSchema,
        await readDocument(detailPath, `compiled detail for ${indexedItem.name}`),
        detailPath,
      );

      validateDetail(indexedItem, detail, detailPath);
      return detail;
    }),
  );

  const sortedItems = [...items].sort((left, right) => codeUnitCompare(left.name, right.name));
  const itemsByName = new Map(sortedItems.map((item) => [item.name, item]));
  const grouped = new Map<string, RegistryItem[]>();

  for (const item of sortedItems) {
    const group = grouped.get(item.type) ?? [];
    group.push(item);
    grouped.set(item.type, group);
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => codeUnitCompare(left, right))
    .map(([type, groupedItems]) => ({ type, items: groupedItems }));

  return {
    name: index.name,
    homepage: index.homepage,
    items: sortedItems,
    groups,
    getItem(name) {
      return itemsByName.get(name);
    },
  };
}

async function readDocument(path: string, label: string): Promise<unknown> {
  let source: string;

  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Cannot read ${label} at ${path}`, { cause: error });
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Malformed JSON in ${label} at ${path}`, { cause: error });
  }
}

function parseDocument<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid compiled registry document at ${path}: ${issues}`);
}

function validateDetail(index: RegistryIndexItem, detail: RegistryItem, path: string): void {
  for (const field of ["name", "type", "title", "description"] as const) {
    if (index[field] !== detail[field]) {
      throw new Error(
        `Compiled registry detail at ${path} has ${field} ${JSON.stringify(detail[field])}; ` +
          `the index declares ${JSON.stringify(index[field])}`,
      );
    }
  }

  const indexMantine = index.meta?.mantine;
  const detailMantine = detail.meta?.mantine;
  for (const field of ["requires", "provider"] as const) {
    if (indexMantine?.[field] !== detailMantine?.[field]) {
      throw new Error(`Compiled registry detail at ${path} disagrees with index metadata ${field}`);
    }
  }

  assertUnique(
    detail.files.map((file) => file.path),
    `compiled file paths for ${detail.name}`,
    path,
  );
  for (const file of detail.files) assertSafeRelativePath(file.path, "compiled file path", path);

  if (detail.dependencies) {
    assertUnique(detail.dependencies, `dependencies for ${detail.name}`, path);
  }
  if (detail.registryDependencies) {
    assertUnique(detail.registryDependencies, `registry dependencies for ${detail.name}`, path);
  }
  if (!detailMantine) return;

  if (detailMantine.stylesApi) {
    for (const [component, selectors] of Object.entries(detailMantine.stylesApi)) {
      assertUnique(selectors, `Styles API selectors for ${component}`, path);
    }
  }

  if (detailMantine.props) {
    for (const [component, props] of Object.entries(detailMantine.props)) {
      assertUnique(
        props.map((prop) => prop.name),
        `prop names for ${component}`,
        path,
      );
    }
  }

  if (detailMantine.usage) {
    assertSafeRelativePath(detailMantine.usage.path, "usage path", path);
  }

  if (detailMantine.themeFragment) {
    assertSafeRelativePath(detailMantine.themeFragment.path, "theme fragment path", path);
  }

  if (detailMantine.themeSummary) {
    if (!detailMantine.themeFragment) {
      throw new Error(`Theme summary in ${path} has no matching theme fragment`);
    }
    validateThemeSummary(detailMantine.themeSummary, path);
  }
}

function validateThemeSummary(
  summary: NonNullable<NonNullable<RegistryItem["meta"]>["mantine"]["themeSummary"]>,
  path: string,
): void {
  assertSortedUnique(summary.keys, "theme summary keys", path);
  assertSortedUnique(
    summary.components.items.map((component) => component.name),
    "theme summary component names",
    path,
  );

  for (const component of summary.components.items) {
    const names = component.channels.map((channel) => channel.name);
    assertUnique(names, `theme summary channels for ${component.name}`, path);
    const order = names.map((name) => channelOrder.indexOf(name));
    if (order.some((value, index) => index > 0 && order[index - 1] > value)) {
      throw new Error(
        `Theme summary channels for ${component.name} are not in stable order at ${path}`,
      );
    }
  }
}

function assertSafeRelativePath(value: string, label: string, documentPath: string): void {
  const segments = value.split("/");
  if (
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe ${label} ${JSON.stringify(value)} in ${documentPath}`);
  }
}

function assertSortedUnique(values: string[], label: string, path: string): void {
  assertUnique(values, label, path);
  const sorted = [...values].sort(codeUnitCompare);
  if (values.some((value, index) => value !== sorted[index])) {
    throw new Error(`${label} are not code-unit sorted at ${path}`);
  }
}

function assertUnique(values: string[], label: string, path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value))
      throw new Error(`Duplicate ${label} value ${JSON.stringify(value)} at ${path}`);
    seen.add(value);
  }
}

function codeUnitCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
