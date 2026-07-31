---
title: URLs and namespaces
description: Decide how consumers should address one item or a reusable registry collection.
sidebar:
  order: 1
---

Direct URLs and configured namespaces use the same resolver and installer. They differ only in how
Manteen locates related documents and records their identity.

| Capability | Direct item URL | Configured namespace |
| --- | --- | --- |
| Install one self-contained item | Yes | Yes |
| Multi-file item | Yes | Yes |
| npm dependencies, package styles, theme fragments | Yes | Yes |
| `list` against a registry index | No | Yes |
| Stable short references | No | Yes |
| Registry request headers or query parameters | No | Yes |
| Bare parent-local registry dependencies | No | Yes |
| Repeated use across many items | Verbose | Designed for it |

## Direct URL

```bash
npx manteen add https://example.com/r/release-panel.json
```

The canonical receipt identity begins with `url:` and retains the source URL. Because the item has
no namespace, a bare `registryDependencies` entry cannot be interpreted safely and is refused.
Fully qualified dependencies work only when their namespaces are already configured.

## Namespace

```json
{
  "registries": {
    "@friend": {
      "url": "https://example.com/r/{name}.json",
      "index": "https://example.com/r/registry.json"
    }
  }
}
```

```bash
npx manteen add @friend/release-panel
```

The namespace belongs to the consumer configuration, but it can also be part of the compiled item
graph. `manteen-kit` qualifies a catalog's bare `uses` entries with its declared namespace so other
interchange clients do not accidentally resolve them from an unrelated public registry. Therefore:

- a self-contained item can be installed by URL or assigned a convenient consumer namespace;
- a hand-authored item may keep dependencies bare and let Manteen visibly assume they are local;
- a dependency-bearing kit registry should be shared under the namespace declared by its catalog.

There is intentionally no central registry directory. A registry URL, repository documentation,
or namespace snippet is enough to share the content.
