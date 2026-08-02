import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { splitHttpLinks } from "../lib/text-links.ts";

const runner = readFileSync(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");
const portal = readFileSync(new URL("../components/processing-portal.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("公開処理の説明にあるHTTP URLを句読点と分ける", () => {
  assert.deepEqual(splitHttpLinks("詳細はhttps://example.com/data。次は (https://example.com/a_(b))。"), [
    { kind: "text", value: "詳細は" },
    { kind: "link", value: "https://example.com/data" },
    { kind: "text", value: "。次は (" },
    { kind: "link", value: "https://example.com/a_(b)" },
    { kind: "text", value: ")。" },
  ]);
});

test("HTTPS以外の文字列や不正URLはリンクにしない", () => {
  assert.deepEqual(splitHttpLinks("example.com と ftp://example.com と http:// を表示"), [
    { kind: "text", value: "example.com と ftp://example.com と http:// を表示" },
  ]);
});

test("リンク化は公開実行ページだけに適用する", () => {
  assert.match(runner, /<LinkedDescription text=\{flow\.description\} \/>/);
  assert.match(portal, /<p className="portal-card-description">\{item\.description\}<\/p>/);
  assert.doesNotMatch(portal, /LinkedDescription|splitHttpLinks/);
  assert.match(styles, /\.runner-description a \{[^}]*font-weight: 400;/);
});
