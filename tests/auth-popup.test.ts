import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authProviderPath = new URL("../components/auth-provider.tsx", import.meta.url);
const authCallbackPath = new URL("../app/auth/callback/page.tsx", import.meta.url);

test("Googleログインは作成画面を離れないポップアップで開始する", async () => {
  const source = await readFile(authProviderPath, "utf8");

  assert.match(source, /window\.open\(/);
  assert.match(source, /skipBrowserRedirect:\s*true/);
  assert.match(source, /popup=1/);
  assert.match(source, /ポップアップを許可して/);
});

test("認証コールバックは親画面へ完了を通知して閉じる", async () => {
  const source = await readFile(authCallbackPath, "utf8");

  assert.match(source, /notifyOpener\(\{ type: AUTH_POPUP_COMPLETE \}\)/);
  assert.match(source, /window\.close\(\)/);
  assert.match(source, /window\.location\.replace\(returnTo/);
});
