import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ADMIN_EMAIL, isAdminEmail } from "../lib/admin-access.ts";

test("管理者メールはclavisflow@gmail.comだけを許可する", () => {
  assert.equal(ADMIN_EMAIL, "clavisflow@gmail.com");
  assert.equal(isAdminEmail("clavisflow@gmail.com"), true);
  assert.equal(isAdminEmail(" CLAVISFLOW@GMAIL.COM "), true);
  assert.equal(isAdminEmail("other@example.com"), false);
  assert.equal(isAdminEmail(undefined), false);
});

test("完全削除APIは編集トークンがない場合に認証済み管理者を必須にする", async () => {
  const db = await readFile(new URL("../supabase/functions/_shared/db.ts", import.meta.url), "utf8");
  const deletion = await readFile(new URL("../supabase/functions/delete-flow/index.ts", import.meta.url), "utf8");
  assert.match(db, /ADMIN_EMAIL = "clavisflow@gmail\.com"/);
  assert.match(db, /requireAdmin[\s\S]*?requireUser\(request\)[\s\S]*?user\.email[\s\S]*?ADMIN_EMAIL/);
  assert.match(db, /!user\.email_confirmed_at/);
  assert.match(deletion, /if \(token\)[\s\S]*?requireEditor[\s\S]*?else[\s\S]*?requireAdmin\(request\)/);
  assert.match(deletion, /storage\.from\("flow-samples"\)\.remove/);
  assert.match(deletion, /rpc\("delete_flow_completely"/);
});

test("完全削除は処理本体に加えてお気に入りと利用数も削除する", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202607300011_add_complete_flow_delete.sql", import.meta.url), "utf8");
  assert.match(migration, /delete from public\.flow_favorites where process_key = p_process_key/);
  assert.match(migration, /delete from public\.flow_usage_daily where process_key = p_process_key/);
  assert.match(migration, /delete from public\.flows where id = p_flow_id and public_id = p_process_key/);
  assert.match(migration, /grant execute on function public\.delete_flow_completely\(uuid, text\) to service_role/);
});

test("公開ページの完全削除操作は管理者だけに表示し内蔵公式処理には表示しない", async () => {
  const runner = await readFile(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");
  assert.match(runner, /isAdminEmail\(user\?\.email\) && !getBundledDemo\(flow\.publicId\)/);
  assert.match(runner, /公開ページ、処理定義、全バージョン、サンプルデータ、お気に入り記録、利用数を削除/);
  assert.match(runner, /deletePublicFlowAsAdmin\(flow\.publicId\)/);
});
