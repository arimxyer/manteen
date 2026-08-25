import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const itemNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const REGISTRY_ITEM_TYPES = [
  "registry:lib",
  "registry:block",
  "registry:component",
  "registry:ui",
  "registry:hook",
  "registry:theme",
  "registry:page",
  "registry:file",
  "registry:style",
  "registry:base",
  "registry:font",
  "registry:item",
] as const;
export const REGISTRY_FILE_TYPES = REGISTRY_ITEM_TYPES.filter(
  (type) => type !== "registry:font",
) as [
  Exclude<(typeof REGISTRY_ITEM_TYPES)[number], "registry:font">,
  ...Exclude<(typeof REGISTRY_ITEM_TYPES)[number], "registry:font">[],
];
const targetPrefixes = ["@components/", "@ui/", "@lib/", "@hooks/"] as const;
const channelOrder = ["defaultProps", "classNames", "styles", "vars"] as const;

const isDisplaySafeText = (value: string) =>
  [...value].every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint === 9 ||
      codePoint === 10 ||
      codePoint === 13 ||
      (codePoint >= 32 && codePoint <= 126) ||
      codePoint >= 160
    );
  });
const displaySafeText = z
  .string()
  .refine(isDisplaySafeText, "must not contain raw terminal control characters");
const nonEmptyString = z
  .string()
  .min(1)
  .refine(isDisplaySafeText, "must not contain raw terminal control characters");
const itemName = z.string().regex(itemNamePattern, "must be a safe lowercase item name");
const registryItemType = z.enum(REGISTRY_ITEM_TYPES);
const registryFileType = z.enum(REGISTRY_FILE_TYPES);
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
  .passthrough();

const indexMetaSchema = z
  .object({
    mantine: indexMantineSchema.optional(),
  })
  .passthrough();

const indexItemSchema = z
  .object({
    name: itemName,
    type: registryItemType,
    title: nonEmptyString.optional(),
    description: displaySafeText.optional(),
    meta: indexMetaSchema.optional(),
  })
  .passthrough();

const registryIndexSchema = z
  .object({
    $schema: nonEmptyString.optional(),
    name: nonEmptyString,
    homepage: displaySafeText.optional(),
    items: z.array(indexItemSchema),
  })
  .passthrough();

const sourceDocumentSchema = z
  .object({
    path: nonEmptyString,
    content: displaySafeText,
  })
  .passthrough();

const propSchema = z
  .object({
    name: nonEmptyString,
    type: nonEmptyString,
    required: z.boolean().optional(),
    default: displaySafeText.optional(),
    description: displaySafeText.optional(),
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
    name: displaySafeText,
    channels: z.array(themeChannelSchema),
    dynamic: z.boolean(),
  })
  .strict();

const themeSummarySchema = z
  .object({
    keys: z.array(displaySafeText),
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
    stylesApi: z.record(nonEmptyString, z.array(nonEmptyString)).optional(),
    props: z.record(nonEmptyString, z.array(propSchema)).optional(),
    usage: sourceDocumentSchema.optional(),
    themeFragment: sourceDocumentSchema.optional(),
    themeSummary: themeSummarySchema.optional(),
  })
  .passthrough();

const detailMetaSchema = z
  .object({
    mantine: mantineMetaSchema.optional(),
  })
  .passthrough();

const compiledFileSchema = z
  .object({
    path: nonEmptyString,
    type: registryFileType,
    target: printableLine.optional(),
    content: displaySafeText,
  })
  .passthrough();

type CssValue = string | { [key: string]: CssValue };
const cssValueSchema: z.ZodType<CssValue> = z.lazy(() =>
  z.union([displaySafeText, z.record(nonEmptyString, cssValueSchema)]),
);

const registryDetailSchema = z
  .object({
    $schema: nonEmptyString.optional(),
    name: itemName,
    type: registryItemType,
    title: nonEmptyString.optional(),
    description: displaySafeText.optional(),
    docs: displaySafeText.optional(),
    files: z.array(compiledFileSchema),
    dependencies: z.array(printableLine).optional(),
    devDependencies: z.array(printableLine).optional(),
    registryDependencies: z.array(printableLine).optional(),
    css: z.record(nonEmptyString, cssValueSchema).optional(),
    meta: detailMetaSchema.optional(),
  })
  .passthrough();

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
  const pending = defaultRegistryPromise;
  return pending.catch((error) => {
    if (defaultRegistryPromise === pending) defaultRegistryPromise = undefined;
    throw error;
  });
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
  for (const file of detail.files) {
    assertSafeRelativePath(file.path, "compiled file path", path);
    if ((file.type === "registry:file" || file.type === "registry:page") && !file.target) {
      throw new Error(
        `Compiled ${file.type} file ${JSON.stringify(file.path)} has no install target at ${path}`,
      );
    }
    if (file.target) assertSafeInstallTarget(file.target, path);
  }

  if (detail.dependencies) {
    assertUnique(detail.dependencies, `dependencies for ${detail.name}`, path);
  }
  if (detail.devDependencies) {
    assertUnique(detail.devDependencies, `development dependencies for ${detail.name}`, path);
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
  summary: NonNullable<NonNullable<NonNullable<RegistryItem["meta"]>["mantine"]>["themeSummary"]>,
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
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    }) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe ${label} ${JSON.stringify(value)} in ${documentPath}`);
  }
}

function assertSafeInstallTarget(value: string, documentPath: string): void {
  if (/^[a-z]:/i.test(value)) {
    throw new Error(`Unsafe install target ${JSON.stringify(value)} in ${documentPath}`);
  }

  let relativeTarget = value;
  if (value.startsWith("~/")) {
    relativeTarget = value.slice(2);
  } else {
    const prefix = targetPrefixes.find((candidate) => value.startsWith(candidate));
    if (prefix) relativeTarget = value.slice(prefix.length);
    else if (value.startsWith("@")) {
      throw new Error(`Unsafe install target ${JSON.stringify(value)} in ${documentPath}`);
    }
  }

  assertSafeRelativePath(relativeTarget, "install target", documentPath);
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
