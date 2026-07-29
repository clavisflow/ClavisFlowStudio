import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("お気に入りはユーザーと処理の組み合わせで重複を防ぐ", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202607290009_add_flow_favorites.sql", import.meta.url), "utf8");
  assert.match(migration, /primary key \(user_id, process_key\)/);
  assert.match(migration, /where active/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Inactive rows are retained as synchronization tombstones/);
  assert.match(migration, /flow_favorite_counts/);
});

test("お気に入り同期はログインを必須とし最新状態を保存する", async () => {
  const favoriteFunction = await readFile(new URL("../supabase/functions/flow-favorites/index.ts", import.meta.url), "utf8");
  assert.match(favoriteFunction, /requireUser\(request\)/);
  assert.match(favoriteFunction, /favorite\.updatedAt > Number\(remote\.client_updated_at\)/);
  assert.match(favoriteFunction, /onConflict: "user_id,process_key"/);
  assert.match(favoriteFunction, /rpc\("flow_favorite_counts"/);
});
