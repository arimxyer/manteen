import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://arimxyer.github.io",
  base: "/manteen",
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
        Sidebar: "./src/components/SiteSidebar.astro",
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
