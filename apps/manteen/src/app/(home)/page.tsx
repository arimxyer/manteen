import { Authoring } from "@/components/home/authoring";
import { Closing } from "@/components/home/closing";
import { Commands } from "@/components/home/commands";
import { Hero } from "@/components/home/hero";
import { Interop } from "@/components/home/interop";
import { Ownership } from "@/components/home/ownership";
import { TryItOut } from "@/components/home/try-it-out";

/**
 * Composition only. Each section owns its own copy, data and layout in
 * `@/components/home`, so what this file shows is the page's running order.
 *
 * The wrapper is a `div` and must stay one. `HomeLayout` already renders the page's
 * `<main id="nd-home-layout">`, and a second `<main>` inside it is invalid HTML that
 * leaves assistive technology with two main landmarks and no way to tell which is the
 * document's. The padding cannot move up to that container either — the header is its
 * first child, so a top padding there would push the header down rather than the copy.
 */
export default function HomePage() {
  return (
    <div className="pt-4 pb-6 md:pb-12">
      <Hero />

      <div className="mx-auto mt-12 flex w-full max-w-[1400px] flex-col gap-10 px-6 md:px-12 lg:mt-20">
        <p className="text-2xl leading-snug font-light tracking-tight md:text-3xl xl:text-4xl">
          Manteen is a <span className="font-medium text-brand">Mantine-native</span> registry
          toolchain. Components arrive as{" "}
          <span className="font-medium text-brand">source you edit</span>, not a dependency you wrap
          — and every install, diff, and update is a{" "}
          <span className="font-medium text-brand">plan you read first</span>.
        </p>

        <TryItOut />
        <Authoring />
        <Interop />
        <Ownership />
        <Commands />
        <Closing />
      </div>

      <footer className="mx-auto mt-16 w-full max-w-[1400px] border-t px-6 pt-6 text-xs text-fd-muted-foreground md:px-12">
        <p>Manteen is an independent project and is not affiliated with the Mantine team.</p>
      </footer>
    </div>
  );
}
