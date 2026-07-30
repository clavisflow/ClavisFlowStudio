import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const image = readFileSync(new URL("../public/og.png", import.meta.url));

test("OGP画像の実寸とメタデータを一致させる", () => {
  assert.equal(image.toString("ascii", 1, 4), "PNG");
  assert.equal(image.readUInt32BE(16), 1731);
  assert.equal(image.readUInt32BE(20), 909);
  assert.match(layout, /images: \[\{ url: "\/og\.png", width: 1731, height: 909,/);
});

test("Twitterの大きなカードでも同じOGP画像を使う", () => {
  assert.match(layout, /card: "summary_large_image"/);
  assert.match(layout, /twitter:[\s\S]*images: \["\/og\.png"\]/);
});
