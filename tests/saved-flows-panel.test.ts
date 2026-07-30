import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("../components/saved-flows-panel.tsx", import.meta.url), "utf8");

test("saved flows are loaded only when the panel opens", () => {
  assert.match(panelSource, /useState<ManagedFlow\[\]>\(\[\]\)/);
  assert.match(panelSource, /function openPanel\(\)\s*{\s*setFlows\(listManagedFlows\(\)\);\s*setOpen\(true\);/s);
  assert.doesNotMatch(panelSource, /useState<ManagedFlow\[\]>\(\(\)\s*=>\s*listManagedFlows\(\)\)/);
});
