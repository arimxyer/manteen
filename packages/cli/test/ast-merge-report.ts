import { evaluateAstMergeCorpus, renderAstMergeSpikeMarkdown } from "./support/ast-merge-corpus";

const report = evaluateAstMergeCorpus();
if (process.argv.includes("--markdown")) {
  process.stdout.write(renderAstMergeSpikeMarkdown(report));
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
