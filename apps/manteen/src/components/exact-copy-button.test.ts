import assert from "node:assert/strict";
import { test } from "node:test";
import { writeExactText } from "./exact-copy-button";

test("exact copy passes preserved source bytes rather than highlighted DOM text", async () => {
  const source = 'const message = "π";\r\n// trailing line\r\n';
  let copied: string | undefined;

  await writeExactText(source, async (value) => {
    copied = value;
  });

  assert.equal(copied, source);
  assert.deepEqual(Buffer.from(copied ?? ""), Buffer.from(source));
});
