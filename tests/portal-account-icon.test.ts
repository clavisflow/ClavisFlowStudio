import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerSource = readFileSync(new URL("../components/portal-header.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("ヘッダのアカウント名の先頭に人型アイコンを表示する", () => {
  assert.match(headerSource, /<UserRound size=\{17\} aria-hidden="true" \/>\s*<span className="portal-account-name">\{displayName\}<\/span>/);
  assert.match(styles, /\.portal-account summary > svg \{ flex: none; \}/);
  assert.match(styles, /\.portal-account-name \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; \}/);
});
