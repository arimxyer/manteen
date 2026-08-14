import { HomeLayout } from "fumadocs-ui/layouts/home";
import { HomeHeader } from "@/components/home/home-header";
import { baseOptions, homeLinks } from "@/lib/layout.shared";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    // The header slot is overridden for the marketing layout only. The docs layout keeps
    // the edge-to-edge bar, where a floating pill would fight the sidebar it sits above.
    <HomeLayout {...baseOptions()} links={homeLinks} slots={{ header: HomeHeader }}>
      {children}
    </HomeLayout>
  );
}
