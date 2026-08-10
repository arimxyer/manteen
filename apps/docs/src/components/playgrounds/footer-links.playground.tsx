import { Text } from "@mantine/core";
import { IconBrandInstagram, IconBrandTwitter, IconBrandYoutube } from "@tabler/icons-react";

import {
  FooterLinks,
  type FooterLinksGroup,
  type FooterLinksSocialLink,
} from "../../../../../registry/mantine-ui/footer-links/footer-links";
import footerClasses from "../../../../../registry/mantine-ui/footer-links/footer-links.module.css";
import type { PlaygroundAdapter } from "./contract";

// FooterLinks' responsive collapse (link columns hide, brand block + bottom bar stack and
// center) is a real `@media (max-width: 48em)` rule in its own CSS module — it watches the
// actual browser viewport, not this stage's simulated width (the stage only sets a CSS
// `width` on a div in the same document; see Playground.tsx's `slotStyle`). Left alone, the
// shell's Mobile toggle would just clip the desktop-only layout inside a narrow slot instead
// of showing the collapse FooterLinks actually ships. FooterLinks has no Styles API (see the
// porter's `stylesApiDecision` — no `classNames` prop), so there is no prop-level lever
// either. Instead this imports the item's OWN css module: ES modules are singletons, so
// `footerClasses` here is the exact same hashed-class mapping `footer-links.tsx` renders
// with, which lets this force the real breakpoint's own rules onto those live classes while
// "mobile" is selected — same intent as header-mega-menu's FORCE_MOBILE_CSS, adapted to a
// component with no stable global class to hook. Scoped to a `data-fl-mobile` wrapper (not
// document-global like header-mega-menu) because FooterLinks renders no portals, so nothing
// here needs to escape this subtree.
const FORCE_MOBILE_CSS = `
  [data-fl-mobile="true"] .${footerClasses.logo} { display: flex !important; flex-direction: column !important; align-items: center !important; }
  [data-fl-mobile="true"] .${footerClasses.description} { text-align: center !important; }
  [data-fl-mobile="true"] .${footerClasses.inner} { flex-direction: column !important; align-items: center !important; }
  [data-fl-mobile="true"] .${footerClasses.groups} { display: none !important; }
  [data-fl-mobile="true"] .${footerClasses.afterFooter} { flex-direction: column !important; }
`;

// Live-demo hrefs are "#" (same convention article-card uses for its live preview) so
// clicking a link inside the isolated stage never navigates the docs page away — Copy JSX
// below swaps in realistic paths, matching footer-links.usage.tsx's own example data.
const GROUPS: FooterLinksGroup[] = [
  {
    title: "About",
    links: [
      { label: "Features", href: "#" },
      { label: "Pricing", href: "#" },
      { label: "Support", href: "#" },
      { label: "Forums", href: "#" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Contribute", href: "#" },
      { label: "Media assets", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Releases", href: "#" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Join Discord", href: "#" },
      { label: "Follow on Twitter", href: "#" },
      { label: "Email newsletter", href: "#" },
      { label: "GitHub discussions", href: "#" },
    ],
  },
];

const SOCIAL_LINKS: FooterLinksSocialLink[] = [
  { href: "#", label: "Twitter", icon: <IconBrandTwitter size={18} stroke={1.5} /> },
  { href: "#", label: "Youtube", icon: <IconBrandYoutube size={18} stroke={1.5} /> },
  { href: "#", label: "Instagram", icon: <IconBrandInstagram size={18} stroke={1.5} /> },
];

const adapter: PlaygroundAdapter = {
  item: "footer-links",
  defaultProps: {
    brandName: "Acme",
    tagline: "Build fully functional accessible web applications faster than ever",
    copyright: "© 2026 Acme. All rights reserved.",
    showSocial: true,
  },
  controls: [
    { kind: "text", prop: "brandName", label: "Brand name", compact: true },
    { kind: "text", prop: "tagline", label: "Tagline", wide: true },
    { kind: "text", prop: "copyright", label: "Copyright", wide: true },
    { kind: "switch", prop: "showSocial", label: "Social links" },
  ],
  // FooterLinks has no callback props (every link is a plain <a href>, and the upstream
  // preventDefault() demo stub was dropped once hrefs became real — see the porter's
  // curationNotes), so there is nothing to wire recordEvent into: same shape as
  // stats-grid.playground.tsx, which drops the param for the same reason.
  render: (props, _recordEvent, context) => (
    <div data-fl-mobile={context.viewport === "mobile" ? "true" : undefined}>
      {context.viewport === "mobile" && <style>{FORCE_MOBILE_CSS}</style>}
      <FooterLinks
        logo={
          <Text fw={700} size="lg">
            {String(props.brandName) || "Acme"}
          </Text>
        }
        tagline={String(props.tagline) || undefined}
        groups={GROUPS}
        copyright={String(props.copyright) || undefined}
        socialLinks={props.showSocial ? SOCIAL_LINKS : undefined}
      />
    </div>
  ),
  renderJsx: (props) => {
    const taglineProp = props.tagline ? `\n      tagline=${JSON.stringify(props.tagline)}` : "";
    const copyrightProp = props.copyright
      ? `\n      copyright=${JSON.stringify(props.copyright)}`
      : "";
    const socialProp = props.showSocial ? "\n      socialLinks={socialLinks}" : "";
    const socialImport = props.showSocial
      ? '\nimport {\n  IconBrandInstagram,\n  IconBrandTwitter,\n  IconBrandYoutube,\n} from "@tabler/icons-react";'
      : "";
    const socialTypeImport = props.showSocial ? ", type FooterLinksSocialLink" : "";
    const socialConst = props.showSocial
      ? `\n\nconst socialLinks: FooterLinksSocialLink[] = [
  {
    href: "https://twitter.com/acme",
    label: "Twitter",
    icon: <IconBrandTwitter size={18} stroke={1.5} />,
  },
  {
    href: "https://youtube.com/@acme",
    label: "Youtube",
    icon: <IconBrandYoutube size={18} stroke={1.5} />,
  },
  {
    href: "https://instagram.com/acme",
    label: "Instagram",
    icon: <IconBrandInstagram size={18} stroke={1.5} />,
  },
];`
      : "";

    return `import { Text } from "@mantine/core";${socialImport}
import { FooterLinks, type FooterLinksGroup${socialTypeImport} } from "@/components/ui/footer-links";

const groups: FooterLinksGroup[] = [
  {
    title: "About",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Support", href: "/support" },
      { label: "Forums", href: "/forums" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "Contribute", href: "/contribute" },
      { label: "Media assets", href: "/media" },
      { label: "Changelog", href: "/changelog" },
      { label: "Releases", href: "/releases" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Join Discord", href: "https://discord.gg/acme" },
      { label: "Follow on Twitter", href: "https://twitter.com/acme" },
      { label: "Email newsletter", href: "/newsletter" },
      { label: "GitHub discussions", href: "https://github.com/acme/acme/discussions" },
    ],
  },
];${socialConst}

export function SiteFooter() {
  return (
    <FooterLinks
      logo={
        <Text fw={700} size="lg">
          ${String(props.brandName) || "Acme"}
        </Text>
      }${taglineProp}
      groups={groups}${copyrightProp}${socialProp}
    />
  );
}`;
  },
  stage: {
    desktopWidth: "100%",
  },
};

export default adapter;
