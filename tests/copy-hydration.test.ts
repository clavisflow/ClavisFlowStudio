import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");

test("コピー作成画面は初回描画後にURLを読み込んでフォームを表示する", () => {
  assert.match(editor, /const \[loading, setLoading\] = useState\(true\)/);
  assert.match(editor, /作成画面を準備しています/);
  assert.match(editor, /loadPublicFlow\(copyId\)/);
  assert.match(editor, /\.finally\(\(\) => \{ if \(active\) setLoading\(false\); \}\)/);
});
