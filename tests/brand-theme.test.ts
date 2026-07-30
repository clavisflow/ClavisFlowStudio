import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("ブランドの主要色とボタンを緑で統一する", () => {
  assert.match(styles, /--primary: #19724f;/);
  assert.match(styles, /--primary-dark: #0f573b;/);
  assert.match(styles, /\.button\.primary \{[^}]*background: var\(--primary\);/);
  assert.match(styles, /--portal-primary: #19724f;/);
  assert.match(styles, /\.portal-button\.primary \{[^}]*background: linear-gradient\(135deg, #21805a, #146443\);/);
  assert.doesNotMatch(styles, /--portal-purple/);
});

test("意味を区別する限定公開とAIサンプルには紫を残す", () => {
  assert.match(styles, /\.flow-visibility-badge\.unlisted \{[^}]*#5b43c4/);
  assert.match(styles, /\.editor-ai-samples \{[^}]*#cfc9ff/);
});

test("良いねのON状態は落ち着いたピンクで表示する", () => {
  assert.match(styles, /\.portal-favorite-stat\.active \{ color: #b6536d; \}/);
  assert.match(styles, /\.portal-favorite-stat\.active:hover \{[^}]*background: #fbf0f3;/);
});
