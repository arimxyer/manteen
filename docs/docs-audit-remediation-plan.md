# Documentation audit remediation plan

Status: implemented and re-audited locally on 2026-08-11. This is local UI evidence, not a
deployment or release receipt.

## Baseline

The production docs audit scored **14/20 (Good)**:

| Dimension | Score | Verified gap |
| --- | ---: | --- |
| Accessibility | 3/4 | Functional landing metadata renders at 10px. |
| Performance | 3/4 | The playground viewport switch animates `width`. |
| Responsive design | 4/4 | The audited desktop and mobile routes reflow without page overflow. |
| Theming | 2/4 | Intentional landing colors and shapes are not fully represented by the documented system. |
| Implementation integrity | 2/4 | The code and `DESIGN.md` disagree on repeated type, color, and radius values. |

The static detector reported 113 findings: 53 undocumented font sizes, 49 undocumented colors,
5 undocumented radii, 2 intentional side rails, 2 brand-font warnings, 1 width transition, and
1 false font-declaration warning from a vendoring command inside a CSS comment. The rendered audit
also found 22 distinct 10px landing labels and 93-99 character documentation lines.

Registry-card thumbnail internals, syntax-highlighting colors, closed mobile table-of-contents
markup, Starlight's desktop main-plus-TOC grid, and the self-hosted Fraunces accent remain verified
exceptions rather than remediation targets. The landing rails, kickers, and decorative section
numbers were initially classified as intentional, then reassessed and removed during distillation.

## Ordered remediation

### 1. Typeset the landing metadata

- Raise functional and provenance labels below 12px to a 12px micro role.
- Keep the established Figtree, Fraunces, system-sans, and mono responsibilities unchanged.
- Record the actual repeated type steps as a semantic ramp in `DESIGN.md`.
- Normalize isolated near-matches to that ramp; keep the decorative, `aria-hidden` registry
  thumbnail on a narrowly documented detector waiver instead of treating its scaled text as UI.

Acceptance: no rendered 10px functional labels at 1440x1000 or 390x844, and no unexplained
`design-system-font-size` findings.

### 2. Repair the reading measure

- Keep the 52rem technical content canvas so code, tables, and source artifacts retain useful room.
- Constrain ordinary prose and list copy to 75ch inside that canvas.
- Leave bounded horizontal scrolling on code and tabular artifacts intact.

Acceptance: ordinary documentation prose stays at or below 75 characters per line while technical
artifacts remain usable at desktop and mobile widths.

### 3. Reconcile the design contract

- Promote intentional repeated landing colors to local semantic tokens and document the durable
  palette roles in `DESIGN.md`.
- Normalize one-off radii to the established small, action, medium, panel, and pill scale.
- Preserve the approved source-state meanings: indigo for identity/planning, mint for resolution,
  and amber for local or incoming change.

Acceptance: no unexplained design-system color or radius drift in source scans, with visual states
and both themes preserved.

### 4. Polish motion and verify the whole path

- Remove the playground's layout-property width transition; the viewport state may change
  immediately rather than forcing reflow animation.
- Override Pagefind's generated checkbox tick so its geometry changes immediately and only opacity
  transitions. Keep the override narrow to Starlight's search region.
- Rebuild the generated registry before the docs build.
- Run repository checks proportionate to the docs/CSS scope, then repeat the audit once at the same
  routes and viewports.

Acceptance: no product-owned layout-property transition, successful registry/docs builds, a clean
source diff, and no regression in accessibility, responsive behavior, theming, or implementation
integrity. Raw dependency declarations reported without cascade context must be documented
separately from effective browser behavior.

## Repeatable audit matrix

Use the supported Bun CLI surface throughout:

```bash
bunx impeccable detect apps/docs
bunx impeccable detect --scope type apps/docs
bunx impeccable detect --scope layout apps/docs
```

After `bun run build:registry` and the production docs build, serve the built site locally and scan
these representative routes at both `1440x1000` and `390x844`:

- `/manteen/`
- `/manteen/getting-started/`
- `/manteen/registry/`
- `/manteen/registry/article-card/`
- `/manteen/getting-started/agent-guide/`
- `/manteen/registry-authors/`
- `/manteen/reference/cli/`
- `/manteen/registry/header-mega-menu/`
- `/manteen/registry/theme/`

The post-change report must compare the same five scores and distinguish verified defects,
intentional exceptions, detector false positives, build evidence, and any remaining work.

## Post-remediation audit

The repeat audit used the public `bunx impeccable detect` CLI (`3.5.0`). The CLI version is
independent from the installed Impeccable skill bundle version (`4.0.4`).

| Dimension | Before | After | Result |
| --- | ---: | ---: | --- |
| Accessibility | 3/4 | 3/4 | The 10px landing labels are fixed; a complete keyboard, focus, and zoom pass across every interactive registry demo remains outside this rerun. |
| Performance | 3/4 | 4/4 | Product-owned layout transitions are gone; the Pagefind checkmark now resolves to an opacity-only transition. |
| Responsive design | 4/4 | 4/4 | The desktop/mobile matrix remains stable. |
| Theming | 2/4 | 4/4 | Repeated landing values are semantic local tokens and the documented contract records their boundary. |
| Implementation integrity | 2/4 | 4/4 | Decorative rails, kickers, section numbering, excessive uppercase, and repeated implementation drift were removed rather than waived. |
| **Total** | **14/20** | **19/20** | **Excellent** |

Measured gains:

- The initial landing page fell from 43 findings at 1440x1000 and 41 at 390x844 to one development
  finding at each viewport. The correctly built production preview reports zero at both viewports.
- The 23-finding development rerun that triggered distillation was reduced by removing the actual
  markup/CSS roots for all-caps body copy, decorative side rails, heading kickers, decorative
  numbered labels, over-wide text, and gray copy on a colored surface.
- All 22 undersized 10px label instances are gone.
- The static source scan fell from 113 findings to zero. Semantic aside edges, the self-hosted
  Fraunces accent, and `aria-hidden` catalog thumbnails use narrow inline waivers with reasons
  rather than broad rule suppression.
- Registry generation, the 32-page production docs build, Pagefind, sitemap generation, `/r`
  copying, typecheck, lint, guards, and `git diff --check` pass.

Detector boundary and remaining evidence:

- The remaining development finding is Pagefind's generated
  `.pagefind-ui__filter-value--checked::before` declaration. Vite injects dependency CSS into an
  inline `<style>`, and the detector regex-scans that raw rule without cascade or rendered-element
  context. A Bun-driven browser probe on a documentation route verifies that Manteen's local
  override wins and the effective transition property is `opacity`.
- The production URL detector reports zero because Astro extracts the same dependency CSS into a
  linked stylesheet that this detector path does not include in its raw-style corpus. That zero is
  not evidence that the upstream declaration vanished; the effective-cascade probe is the relevant
  performance evidence.
- Registry detail pages produce large `ai-color-palette` counts from rendered syntax-highlighted
  source, while scaled demo regions produce 11.2px and opacity-stack reports. These are kept
  separate from installed component behavior and are not counted as hundreds of product defects.
- This rerun did not repeat manual keyboard order, focus visibility, or browser zoom checks across
  every interactive registry demo, so Accessibility remains 3/4 rather than being promoted on
  detector output alone.
