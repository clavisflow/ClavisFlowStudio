import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("実行できないNEWモックをポータルに含めない", async () => {
  const portal = await readFile(new URL("../components/processing-portal.tsx", import.meta.url), "utf8");
  for (const id of ["multi-store", "invoice-check", "json-products", "conditional-extract"]) {
    assert.doesNotMatch(portal, new RegExp(`id: ["']${id}["']`));
  }
  assert.doesNotMatch(portal, /latestProcessIds|>NEW</);
  assert.match(portal, /allProcesses = useMemo\(\(\) => \[\.\.\.publicItems, \.\.\.officialItems\]/);
});
