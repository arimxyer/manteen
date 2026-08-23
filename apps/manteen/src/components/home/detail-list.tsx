/**
 * The key/detail rows under each band's copy. Three sections render one, which
 * is why it is here rather than beside any of them.
 *
 * The rows stack below `sm`, where a fixed key column would crowd the detail
 * off the line.
 */
export function DetailList({ items }: { items: [string, string][] }) {
  return (
    <ul className="mt-1 mb-6 flex flex-col gap-2.5 border-t pt-5 text-xs">
      {items.map(([key, detail]) => (
        <li key={key} className="flex flex-col gap-x-3 sm:flex-row">
          <code className="shrink-0 font-mono text-fd-foreground sm:w-36">{key}</code>
          <span className="text-fd-muted-foreground">{detail}</span>
        </li>
      ))}
    </ul>
  );
}
