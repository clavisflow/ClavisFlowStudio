import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("プライバシーポリシーは現在のデータ取扱いを説明する", async () => {
  const privacy = await readFile(new URL("../app/(studio)/privacy/page.tsx", import.meta.url), "utf8");
  assert.match(privacy, /Googleスプレッドシートの読込み/);
  assert.match(privacy, /Googleログイン/);
  assert.match(privacy, /お気に入り、利用回数、おすすめ/);
  assert.match(privacy, /イベントIDは原則7日/);
  assert.match(privacy, /直近30日の利用回数/);
  assert.match(privacy, /一般公開.*限定公開/s);
  assert.match(privacy, /開示、訂正、削除、利用停止またはアカウント削除/);
});

test("利用規約は公開範囲とおすすめの性質を明記する", async () => {
  const terms = await readFile(new URL("../app/(studio)/terms/page.tsx", import.meta.url), "utf8");
  assert.match(terms, /限定公開は、特定の相手だけにアクセスを保証する非公開機能ではありません/);
  assert.match(terms, /累計利用回数/);
  assert.match(terms, /品質、安全性、正確性、特定用途への適合性/);
  assert.match(terms, /日本法を適用/);
});
