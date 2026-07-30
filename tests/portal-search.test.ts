import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerSource = readFileSync(new URL("../components/portal-header.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("部分一致検索の入力欄をキーワード検索として案内する", () => {
  assert.match(headerSource, /placeholder="キーワードで検索（例：[^"]+）"/);
});

test("デスクトップの検索欄をコンパクトな幅にする", () => {
  assert.match(styles, /\.portal-search \{[\s\S]*?width: min\(100%, 520px\);/);
});
