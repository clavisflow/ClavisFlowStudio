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

test("モバイルヘッダーのメニューを中央に揃え作成済み処理をアイコン表示にする", async () => {
  const [styles, savedFlows] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/saved-flows-panel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(styles, /\.portal-mobile-menu \{[^}]*top: 11px;[^}]*width: 42px;[^}]*height: 42px;/);
  assert.match(styles, /\.portal-header \.saved-flows-trigger \{[^}]*width: 40px;[^}]*height: 40px;/);
  assert.match(styles, /\.portal-header \.saved-flows-label \{ display: none; \}/);
  assert.match(savedFlows, /aria-label="作成済み処理を開く"/);
  assert.match(savedFlows, /className="saved-flows-label">作成済み処理<\/span>/);
});
