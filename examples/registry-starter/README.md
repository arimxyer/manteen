# Manteen registry starter

This executable example backs the public registry-authoring guide. It deliberately exercises a
multi-file block, a hook, a CSS module, runtime dependencies, a package stylesheet, a theme
fragment, provider/version metadata and Styles API documentation without depending on another
registry item. That final property makes its compiled item safe to share by direct URL.

```bash
npm install
npm run build
```

The compiled item and index are written to `public/r/`. From an initialized disposable consumer,
install the item directly:

```bash
npx manteen add https://example.com/r/release-panel.json
```

Or configure the collection as `@acme` and run `manteen add @acme/release-panel`.
