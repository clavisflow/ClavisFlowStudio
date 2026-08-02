import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("ダッシュボードカードの長いURLをカード内で折り返す", () => {
  assert.match(styles, /\.portal-card-description \{[^}]*overflow-wrap: anywhere;/);
});

test("公開ページの説明に含まれる長いURLも画面内で折り返す", () => {
  assert.match(styles, /\.runner-description \{[^}]*overflow-wrap: anywhere;/);
});
