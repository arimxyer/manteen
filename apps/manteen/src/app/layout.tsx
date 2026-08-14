import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://arimxyer.github.io/manteen"),
  title: {
    default: "Manteen",
    template: "%s | Manteen",
  },
  description: "A Mantine-native component registry toolchain.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
