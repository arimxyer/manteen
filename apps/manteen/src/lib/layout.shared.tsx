import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared";
import { appName, docsRoute, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: appName,
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}

/**
 * Header links for the marketing layout only. The docs layout already reaches these sections
 * through its sidebar, where repeating them reads as a duplicated tree rather than navigation.
 *
 * `nested-url` marks Docs active across the whole section, which the content tree nests behind a
 * route group rather than a URL segment.
 */
export const homeLinks: LinkItemType[] = [
  { text: "Docs", url: docsRoute, active: "nested-url" },
  { text: "Registry", url: `${docsRoute}/registry`, active: "nested-url" },
  { text: "CLI", url: `${docsRoute}/reference/cli` },
];
