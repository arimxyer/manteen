"use client";

import { Header } from "fumadocs-ui/layouts/home/slots/header";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * The marketing header, floated and rounded rather than run edge to edge.
 *
 * This wraps fumadocs' own `Header` instead of reimplementing it. Everything that
 * makes the header work — the collapsible mobile menu, the navigation-menu popup and
 * its positioner, the search trigger, the theme switch — stays theirs, and upgrades
 * keep arriving. `HomeLayout` renders `slots.header` with no props, and their
 * `Header` merges `className` into its own `<header>`, so a wrapper that adds classes
 * is the entire integration.
 *
 * The classes land in two places because the header's paint does. The `<header>`
 * itself is transparent and only positions; the background, blur and border are on
 * its single child. So the child is what has to be constrained and rounded, which is
 * what the `[&>*]` rules do — written against "the only child" rather than a tag name,
 * since which element that is belongs to base-ui rather than to us.
 *
 * The pill is aligned to the hero, not to the section column. The page runs two
 * rhythms — the hero is a full `max-w-[1400px]`, the sections inset another `px-12`
 * inside it — and the header sits directly on top of the hero, so the two read as one
 * stack only if their edges agree. That means no horizontal padding here: the same
 * `mx-auto w-full max-w-[1400px]` the hero uses, including its behaviour of going
 * flush at narrower viewports. `rounded-2xl` is the hero's radius too.
 */
export function HomeHeader(props: ComponentProps<"header">) {
  return (
    <Header
      {...props}
      className={cn(
        // Their `h-14` has to go: the gap above the pill is part of the header's own
        // box, so the height is the bar plus that gap rather than the bar alone.
        "mx-auto h-auto w-full max-w-[1400px] pt-3",
        "[&>*]:rounded-2xl [&>*]:border [&>*]:shadow-sm",
        props.className,
      )}
    />
  );
}
