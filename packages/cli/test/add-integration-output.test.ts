import { describe, expect, test } from "bun:test";

import { ADD_INTEGRATION_NOTE, renderAddIntegrationAdvisory } from "../src/cli/render";

describe("add application-integration boundary", () => {
  test("text and machine modes share one truthful note", () => {
    expect(ADD_INTEGRATION_NOTE).toContain("did not assess application integration");
    expect(ADD_INTEGRATION_NOTE).toContain("consumer-owned application code");
    expect(renderAddIntegrationAdvisory()).toBe(
      `info  application-integration\n  ${ADD_INTEGRATION_NOTE}\n`,
    );
  });
});
