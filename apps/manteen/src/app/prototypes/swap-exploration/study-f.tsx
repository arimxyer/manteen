"use client";

import { InteropPublicationStudy } from "@/components/home/interop-publication";
import type { InteropVariantProps } from "../interop-descriptor/types";

/**
 * Study F remains in the picker as the selected reference. Production owns the
 * shared drawing, while this wrapper preserves the harness's explicit run and
 * reduced-motion controls for side-by-side comparison.
 */
export function SwapStudyF(props: InteropVariantProps) {
  return <InteropPublicationStudy {...props} />;
}
