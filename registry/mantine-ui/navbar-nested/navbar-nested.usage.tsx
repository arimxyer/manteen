import { IconCalendarStats, IconGauge, IconLock, IconNotes } from "@tabler/icons-react";

import { NavbarNested } from "@ui/navbar-nested";

export function AppSidebar() {
  // NavbarNested fills its parent's height (see the `height: 100%` note in
  // navbar-nested.module.css), so it needs a height-constrained wrapper
  // here; in an app shell that's usually AppShell.Navbar instead.
  return (
    <div style={{ height: "100vh" }}>
      <NavbarNested
        versionLabel="v1.4.0"
        user={{
          name: "Jordan Vance",
          email: "jordan@example.com",
        }}
        links={[
          { label: "Dashboard", icon: IconGauge, link: "/dashboard" },
          {
            label: "Market news",
            icon: IconNotes,
            initiallyOpened: true,
            links: [
              { label: "Overview", link: "/news/overview" },
              { label: "Forecasts", link: "/news/forecasts" },
              { label: "Outlook", link: "/news/outlook" },
            ],
          },
          {
            label: "Security",
            icon: IconLock,
            links: [
              { label: "Enable 2FA", link: "/security/2fa" },
              { label: "Change password", link: "/security/password" },
            ],
          },
          { label: "Releases", icon: IconCalendarStats, link: "/releases" },
        ]}
      />
    </div>
  );
}
