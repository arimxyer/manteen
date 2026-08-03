import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://arimxyer.github.io",
  base: "/manteen",
  vite: {
    resolve: {
      // Registry sources are written with the CONSUMER's alias shape (see the root
      // tsconfig's paths comment). Playground adapters import components by relative path,
      // but data-table's own source imports two siblings through those aliases — these two
      // exact-match entries let the docs bundler resolve them. Exact strings, not a
      // wildcard: the docs app must not silently grow a parallel alias universe.
      alias: [
        {
          find: "@/components/ui/empty-state",
          replacement: new URL("../../registry/ui/empty-state.tsx", import.meta.url).pathname,
        },
        {
          find: "@/hooks/use-data-table",
          replacement: new URL(
            "../../registry/blocks/data-table/use-data-table.ts",
            import.meta.url,
          ).pathname,
        },
      ],
    },
  },
  integrations: [
    react(),
    starlight({
      title: "manteen",
      description: "Build, share, install, and maintain Mantine-native component registries.",
      lastUpdated: true,
      editLink: {
        baseUrl: "https://github.com/arimxyer/manteen/edit/main/apps/docs/",
      },
      customCss: ["./src/styles/custom.css"],
      components: {
        Head: "./src/components/SiteHead.astro",
        Header: "./src/components/SiteHeader.astro",
        PageFrame: "./src/components/PageFrame.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/arimxyer/manteen",
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [{ autogenerate: { directory: "getting-started" } }],
        },
        {
          label: "Registry authors",
          items: [{ autogenerate: { directory: "registry-authors" } }],
        },
        {
          label: "Concepts",
          items: [{ autogenerate: { directory: "concepts" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
      ],
    }),
  ],
});
