import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { ArrowRight, Braces, FileJson, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import styles from "./home.module.css";

const authorCatalog = `{
  "name": "article-card",
  "kind": "component",
  "mantine": ">=9",
  "provider": true,
  "uses": ["mantine-ui-license"]
}`;

const maintenancePlan = `manteen update @house/article-card --dry-run --json
manteen update @house/article-card --expect-plan <sha256> --json`;

const directionContract = `<!--
THESIS: Manteen earns its pitch through three real contracts and refuses a generic feature-card landing page.
OWN-WORLD: Fumadocs neutrals, Geist and JetBrains Mono, one amber proof trace, staggered full-width bands, and hairline rules.
STORY: A Mantine developer sees owned source, interoperable output, and safe maintenance, then enters Docs; registry authors retain a visible path.
FIRST VIEWPORT: A two-line ownership promise and primary Docs action sit beside the three-part source map; the first proof band begins in view. The proof trace extends on hover and focus, while reduced motion stays complete and static.
FORM: Proof Stack, grounded structure 4, seed 379cbc96.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export default function HomePage() {
  return (
    <main className={styles.home}>
      <template data-impeccable-contract="379cbc96">{directionContract}</template>

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <h1 id="home-title">Own the source. Keep your changes.</h1>
          <p>
            Manteen is the Mantine-native registry toolchain for installing editable components,
            reviewing every mutation, and updating around local adaptations.
          </p>
          <div className={styles.heroActions}>
            <Link
              href="/docs/getting-started"
              className={cn(buttonVariants({ variant: "primary" }), styles.primaryAction)}
            >
              Start with Manteen
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              href="/docs/registry-authors"
              className={cn(buttonVariants({ variant: "outline" }), styles.secondaryAction)}
            >
              Build a registry
            </Link>
          </div>
        </div>

        <section className={styles.sourceMap} aria-label="Manteen source path">
          <div className={styles.sourceMapRow}>
            <Braces aria-hidden="true" />
            <div>
              <span>Author</span>
              <code>manteen.registry.json</code>
            </div>
          </div>
          <div className={styles.sourceMapRow}>
            <FileJson aria-hidden="true" />
            <div>
              <span>Compile</span>
              <code>/r/article-card.json</code>
            </div>
          </div>
          <div className={styles.sourceMapRow}>
            <GitCompareArrows aria-hidden="true" />
            <div>
              <span>Maintain</span>
              <code>components/ui/article-card.tsx</code>
            </div>
          </div>
        </section>
      </section>

      <section className={styles.proofStack} aria-label="How Manteen works">
        <article className={styles.proofBand}>
          <div className={styles.proofCopy}>
            <div className={styles.proofHeading}>
              <Braces aria-hidden="true" />
              <h2>Author for Mantine, not the wire format.</h2>
            </div>
            <p>
              Describe Mantine requirements, provider needs, source files, and composition in the
              vocabulary your registry actually uses. Manteen owns the interchange details.
            </p>
            <Link href="/docs/registry-authors" className={styles.textLink}>
              Read the authoring guide
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <DynamicCodeBlock
            lang="json"
            code={authorCatalog}
            codeblock={{ title: "manteen.registry.json", className: styles.codeBlock }}
          />
        </article>

        <article className={cn(styles.proofBand, styles.proofBandRight)}>
          <section className={styles.interopFlow} aria-label="Registry interoperability flow">
            <div className={styles.flowNode}>
              <span>Author catalog</span>
              <code>Mantine vocabulary</code>
            </div>
            <ArrowRight className={styles.flowArrow} aria-hidden="true" />
            <div className={cn(styles.flowNode, styles.flowNodeActive)}>
              <span>Static contract</span>
              <code>/r/*.json</code>
            </div>
            <ArrowRight className={styles.flowArrow} aria-hidden="true" />
            <div className={styles.flowNode}>
              <span>Consumer project</span>
              <code>editable source</code>
            </div>
          </section>
          <div className={styles.proofCopy}>
            <div className={styles.proofHeading}>
              <FileJson aria-hidden="true" />
              <h2>Compile once. Stay interoperable.</h2>
            </div>
            <p>
              The generated documents follow the registry interchange contract. Generic clients can
              install them; Manteen reads the richer Mantine metadata for initialization, themes,
              requirements, and maintenance.
            </p>
            <Link href="/docs/concepts/registry-references" className={styles.textLink}>
              Understand registry references
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </article>

        <article className={styles.proofBand}>
          <div className={styles.proofCopy}>
            <div className={styles.proofHeading}>
              <GitCompareArrows aria-hidden="true" />
              <h2>Change the source. Keep the history.</h2>
            </div>
            <p>
              Receipts and pristine bases keep local work distinguishable from upstream source.
              Preview the exact plan, retain its digest, and make destructive authority explicit.
            </p>
            <Link href="/docs/concepts/source-ownership" className={styles.textLink}>
              Follow the ownership model
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <DynamicCodeBlock
            lang="bash"
            code={maintenancePlan}
            codeblock={{ title: "Review, then apply", className: styles.codeBlock }}
          />
        </article>
      </section>

      <section className={styles.close} aria-labelledby="close-title">
        <div>
          <h2 id="close-title">Start with one planned install.</h2>
          <p>
            Initialize a supported Mantine application, inspect an item, and preview every write
            before source lands in the project.
          </p>
        </div>
        <div className={styles.closeActions}>
          <Link
            href="/docs/getting-started"
            className={cn(buttonVariants({ variant: "primary" }), styles.primaryAction)}
          >
            Install your first item
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/docs/reference/cli" className={styles.textLink}>
            Review the CLI contract
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>Manteen is an independent project and is not affiliated with the Mantine team.</p>
      </footer>
    </main>
  );
}
