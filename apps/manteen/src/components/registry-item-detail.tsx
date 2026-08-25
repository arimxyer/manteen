import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import { Tab, Tabs, TabsList, TabsTrigger } from "fumadocs-ui/components/tabs";
import Link from "next/link";
import { ExactCopyButton } from "@/components/exact-copy-button";
import type { CompiledRegistry, RegistryItem, RegistryTypeGroup } from "@/lib/compiled-registry";

const detailTabs = [
  { label: "Preview", value: "preview" },
  { label: "Usage", value: "usage" },
  { label: "Props", value: "props" },
  { label: "Styling", value: "styling" },
  { label: "Source", value: "source" },
] as const;

export function RegistryItemDetail({
  item,
  registry,
}: {
  item: RegistryItem;
  registry: CompiledRegistry;
}) {
  const installCommand = `npm exec --yes=false -- manteen add @house/${item.name}`;

  return (
    <>
      <div className="not-prose mt-6 grid gap-4 rounded-xl border bg-fd-card p-5 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
        <div>
          <p className="m-0 text-sm font-medium text-fd-muted-foreground">Compiled registry item</p>
          <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-fd-muted-foreground">Type</dt>
            <dd className="m-0 font-mono">{item.type}</dd>
            <dt className="text-fd-muted-foreground">Mantine</dt>
            <dd className="m-0 font-mono">{item.meta?.mantine?.requires ?? "Not declared"}</dd>
            <dt className="text-fd-muted-foreground">Provider</dt>
            <dd className="m-0">{item.meta?.mantine?.provider ?? "Not declared"}</dd>
          </dl>
        </div>
        <div>
          <p className="mb-2 mt-0 text-sm font-medium">Canonical install command</p>
          <ServerCodeBlock
            code={installCommand}
            lang="bash"
            codeblock={{
              className: "my-0",
              viewportProps: { "aria-label": `Install @house/${item.name}` },
            }}
          />
          <p className="mb-0 mt-2 text-xs text-fd-muted-foreground">
            This is a command reference, not evidence that installation has run or succeeded.
          </p>
        </div>
      </div>

      {item.docs ? (
        <section className="not-prose mt-6 rounded-xl border p-5" aria-labelledby="author-notes">
          <h2 id="author-notes" className="m-0 text-base font-semibold">
            Authored notes
          </h2>
          <p className="mb-0 mt-2 whitespace-pre-wrap text-sm text-fd-muted-foreground">
            {item.docs}
          </p>
        </section>
      ) : null}

      <RegistryNavigation groups={registry.groups} currentItem={item.name} />

      <Tabs defaultValue="preview">
        <TabsList aria-label="Item detail">
          <span className="my-auto me-auto text-sm font-medium">Item detail</span>
          {detailTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <Tab value="preview">
          <UnavailableState
            title="Live preview unavailable"
            description="This static milestone does not import, evaluate, transpile, or render compiled registry source. Install the item into an application you control to evaluate its runtime behavior."
          />
        </Tab>
        <Tab value="usage">
          <Usage item={item} />
        </Tab>
        <Tab value="props">
          <Props item={item} />
        </Tab>
        <Tab value="styling">
          <Styling item={item} />
        </Tab>
        <Tab value="source">
          <Source item={item} />
        </Tab>
      </Tabs>
    </>
  );
}

function RegistryNavigation({
  groups,
  currentItem,
}: {
  groups: RegistryTypeGroup[];
  currentItem: string;
}) {
  return (
    <nav className="not-prose my-6 rounded-xl border p-5" aria-label="Registry items">
      <h2 className="m-0 text-base font-semibold">All registry items</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <section key={group.type} aria-labelledby={`registry-group-${group.type}`}>
            <h3
              id={`registry-group-${group.type}`}
              className="m-0 font-mono text-xs font-medium text-fd-muted-foreground"
            >
              {group.type}
            </h3>
            <ul className="mb-0 mt-2 list-none space-y-1 p-0">
              {group.items.map((groupedItem) => (
                <li key={groupedItem.name}>
                  <Link
                    href={`/docs/registry/${groupedItem.name}`}
                    aria-current={groupedItem.name === currentItem ? "page" : undefined}
                    className="block rounded-md px-2 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground aria-[current=page]:bg-fd-accent aria-[current=page]:font-medium aria-[current=page]:text-fd-accent-foreground"
                  >
                    {groupedItem.title ?? groupedItem.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}

function Usage({ item }: { item: RegistryItem }) {
  const usage = item.meta?.mantine?.usage;
  if (!usage) {
    return (
      <UnavailableState
        title="No authored usage"
        description="This compiled item does not declare meta.mantine.usage. No example is inferred from its source."
      />
    );
  }

  return (
    <section aria-labelledby="usage-heading">
      <h2 id="usage-heading" className="text-lg font-semibold">
        Authored usage
      </h2>
      <p className="text-sm text-fd-muted-foreground">
        Compiled metadata from <code>{usage.path}</code>. It is displayed, not executed. Copy exact
        writes the preserved registry string rather than the highlighted DOM text.
      </p>
      <ExactSourceCodeBlock code={usage.content} path={usage.path} />
    </section>
  );
}

function Props({ item }: { item: RegistryItem }) {
  const props = item.meta?.mantine?.props;
  if (!props || Object.values(props).every((rows) => rows.length === 0)) {
    return (
      <UnavailableState
        title="No authored props"
        description="This compiled item does not declare meta.mantine.props. Props are not inferred from TypeScript source."
      />
    );
  }

  return (
    <div className="space-y-8">
      {Object.entries(props).map(([component, rows], index) => (
        <section key={component} aria-labelledby={`props-component-${index}`}>
          <h2 id={`props-component-${index}`} className="text-lg font-semibold">
            {component}
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="m-0 w-full min-w-[42rem] border-collapse text-left text-sm">
              <thead className="bg-fd-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Prop</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Requirement</th>
                  <th className="px-3 py-2 font-medium">Default</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((prop) => (
                  <tr key={prop.name} className="border-t align-top">
                    <td className="px-3 py-2 font-mono">{prop.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{prop.type}</td>
                    <td className="px-3 py-2">{requirementLabel(prop.required)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {prop.default ?? "Not authored"}
                    </td>
                    <td className="px-3 py-2 text-fd-muted-foreground">
                      {prop.description ?? "Not authored"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Styling({ item }: { item: RegistryItem }) {
  const mantine = item.meta?.mantine;
  const stylesApi = mantine?.stylesApi;
  const themeSummary = mantine?.themeSummary;
  const themeFragment = mantine?.themeFragment;

  return (
    <div className="space-y-8">
      <section aria-labelledby="styles-api-heading">
        <h2 id="styles-api-heading" className="text-lg font-semibold">
          Authored Styles API
        </h2>
        {stylesApi && Object.keys(stylesApi).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(stylesApi).map(([component, selectors]) => (
              <div key={component} className="rounded-lg border p-4">
                <h3 className="m-0 text-base font-medium">{component}</h3>
                <ul className="mb-0 mt-3 flex list-none flex-wrap gap-2 p-0">
                  {selectors.length > 0 ? (
                    selectors.map((selector) => (
                      <li key={selector}>
                        <code className="rounded-md bg-fd-muted px-2 py-1 text-xs">{selector}</code>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-fd-muted-foreground">No selectors authored.</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <NotApplicable>
            No meta.mantine.stylesApi declaration is present; internal class names are not treated
            as a public styling contract.
          </NotApplicable>
        )}
      </section>

      <section aria-labelledby="theme-summary-heading">
        <h2 id="theme-summary-heading" className="text-lg font-semibold">
          Syntax-only theme summary
        </h2>
        {themeSummary ? (
          <div className="rounded-lg border p-4">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-fd-muted-foreground">Root certainty</dt>
              <dd className="m-0">{certaintyLabel(themeSummary.dynamic)}</dd>
              <dt className="text-fd-muted-foreground">Components certainty</dt>
              <dd className="m-0">{certaintyLabel(themeSummary.components.dynamic)}</dd>
              <dt className="text-fd-muted-foreground">Known root keys</dt>
              <dd className="m-0 font-mono">
                {themeSummary.keys.length > 0 ? themeSummary.keys.join(", ") : "None"}
              </dd>
            </dl>
            {themeSummary.components.items.length > 0 ? (
              <ul className="mb-0 mt-4 space-y-3 pl-5">
                {themeSummary.components.items.map((component) => (
                  <li key={component.name}>
                    <span className="font-medium">{component.name}</span>:{" "}
                    {certaintyLabel(component.dynamic)}
                    {component.channels.length > 0 ? (
                      <ul className="mb-0 mt-1 pl-5 text-sm text-fd-muted-foreground">
                        {component.channels.map((channel) => (
                          <li key={channel.name}>
                            <code>{channel.name}</code>: {certaintyLabel(channel.dynamic)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mb-0 mt-4 text-xs text-fd-muted-foreground">
              Certainty markers describe syntax known in the compiled summary. They do not report
              evaluated values or runtime behavior.
            </p>
          </div>
        ) : (
          <NotApplicable>No compiled theme summary is present for this item.</NotApplicable>
        )}
      </section>

      <section aria-labelledby="theme-fragment-heading">
        <h2 id="theme-fragment-heading" className="text-lg font-semibold">
          Theme fragment
        </h2>
        {themeFragment ? (
          <>
            <p className="text-sm text-fd-muted-foreground">
              Authored source from <code>{themeFragment.path}</code>. It is never imported or
              executed. Copy exact writes the preserved registry string rather than the highlighted
              DOM text.
            </p>
            <ExactSourceCodeBlock
              code={themeFragment.content}
              path={themeFragment.path}
              title={`Authored source · ${themeFragment.path}`}
            />
          </>
        ) : (
          <NotApplicable>
            No authored theme fragment is attached to this compiled item.
          </NotApplicable>
        )}
      </section>
    </div>
  );
}

function Source({ item }: { item: RegistryItem }) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="dependencies-heading">
        <h2 id="dependencies-heading" className="text-lg font-semibold">
          Compiled dependencies
        </h2>
        <DependencyList label="Packages" values={item.dependencies} />
        <DependencyList label="Development packages" values={item.devDependencies} />
        <DependencyList label="Registry items" values={item.registryDependencies} />
        <CssDefinitions css={item.css} />
      </section>

      <section aria-labelledby="source-files-heading">
        <h2 id="source-files-heading" className="text-lg font-semibold">
          Compiled source files
        </h2>
        <p className="text-sm text-fd-muted-foreground">
          Every file below is read from the compiled item document. The highlighted view may
          normalize visual line endings; Copy exact writes the preserved registry string. This site
          does not import, transpile, or evaluate source.
        </p>
        {item.files.length > 0 ? (
          <div className="space-y-6">
            {item.files.map((file) => (
              <article key={file.path} className="rounded-lg border p-4">
                <dl className="mb-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-fd-muted-foreground">Path</dt>
                  <dd className="m-0 font-mono">{file.path}</dd>
                  <dt className="text-fd-muted-foreground">Type</dt>
                  <dd className="m-0 font-mono">{file.type}</dd>
                  {file.target ? (
                    <>
                      <dt className="text-fd-muted-foreground">Install target</dt>
                      <dd className="m-0 font-mono">{file.target}</dd>
                    </>
                  ) : null}
                </dl>
                <ExactSourceCodeBlock code={file.content} path={file.path} />
              </article>
            ))}
          </div>
        ) : (
          <NotApplicable>No compiled source files are attached to this item.</NotApplicable>
        )}
      </section>
    </div>
  );
}

function DependencyList({ label, values }: { label: string; values?: string[] }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr]">
      <h3 className="m-0 text-sm font-medium">{label}</h3>
      {values && values.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {values.map((value) => (
            <li key={value}>
              <code className="rounded-md bg-fd-muted px-2 py-1 text-xs">{value}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-fd-muted-foreground">None declared.</p>
      )}
    </div>
  );
}

function CssDefinitions({ css }: { css?: RegistryItem["css"] }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-[9rem_1fr]">
      <h3 className="m-0 text-sm font-medium">CSS additions</h3>
      {css && Object.keys(css).length > 0 ? (
        <ServerCodeBlock
          code={JSON.stringify(css, null, 2)}
          lang="json"
          codeblock={{ title: "Compiled CSS metadata", className: "m-0" }}
        />
      ) : (
        <p className="m-0 text-sm text-fd-muted-foreground">None declared.</p>
      )}
    </div>
  );
}

function UnavailableState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center">
      <h2 className="m-0 text-base font-semibold">{title}</h2>
      <p className="mx-auto mb-0 mt-2 max-w-2xl text-sm text-fd-muted-foreground">{description}</p>
    </div>
  );
}

function NotApplicable({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-4 text-sm text-fd-muted-foreground">
      Not applicable: {children}
    </p>
  );
}

function ExactSourceCodeBlock({
  code,
  path,
  title = path,
}: {
  code: string;
  path: string;
  title?: string;
}) {
  return (
    <ServerCodeBlock
      code={code}
      lang={languageForPath(path)}
      codeblock={{
        allowCopy: false,
        className: "mb-0",
        title: (
          <span className="flex min-w-0 items-center">
            <span className="truncate">{title}</span>
            <ExactCopyButton code={code} label={`Copy exact source for ${path}`} />
          </span>
        ),
      }}
    />
  );
}

function requirementLabel(required: boolean | undefined): string {
  if (required === true) return "Required";
  if (required === false) return "Optional";
  return "Not specified";
}

function certaintyLabel(dynamic: boolean): string {
  return dynamic ? "Dynamic syntax present" : "Known literal structure";
}

function languageForPath(path: string): string {
  const extension = path.split(".").at(-1);
  if (extension === "tsx") return "tsx";
  if (extension === "ts") return "ts";
  if (extension === "jsx") return "jsx";
  if (extension === "js") return "js";
  if (extension === "css") return "css";
  if (extension === "json") return "json";
  return "text";
}
