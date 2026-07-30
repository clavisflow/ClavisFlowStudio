import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeFlowVisibility } from "../lib/flow-store.ts";
import { flowVisibility } from "../supabase/functions/_shared/validation.ts";

test("既存処理は一般公開として扱い、限定公開だけを明示的に保持する", () => {
  assert.equal(normalizeFlowVisibility(undefined), "public");
  assert.equal(normalizeFlowVisibility("public"), "public");
  assert.equal(normalizeFlowVisibility("unlisted"), "unlisted");
  assert.equal(normalizeFlowVisibility("invalid"), "public");
  assert.equal(flowVisibility(undefined), "public");
  assert.equal(flowVisibility("unlisted"), "unlisted");
  assert.throws(() => flowVisibility("private"), /公開範囲が不正/);
});

test("限定公開をポータルから除外し、URLからの取得は維持する", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202607290007_add_flow_visibility.sql", import.meta.url), "utf8");
  const catalog = await readFile(new URL("../supabase/functions/list-public-flows/index.ts", import.meta.url), "utf8");
  const publicFlow = await readFile(new URL("../supabase/functions/get-public-flow/index.ts", import.meta.url), "utf8");
  assert.match(migration, /visibility public\.flow_visibility not null default 'public'/);
  assert.match(catalog, /\.eq\("visibility", "public"\)/);
  assert.doesNotMatch(publicFlow, /\.eq\("visibility", "public"\)/);
});

test("限定公開の作成と公開はサーバー側でもログイン必須にする", async () => {
  const createFlow = await readFile(new URL("../supabase/functions/create-flow/index.ts", import.meta.url), "utf8");
  const publishFlow = await readFile(new URL("../supabase/functions/publish-flow/index.ts", import.meta.url), "utf8");
  const updateFlow = await readFile(new URL("../supabase/functions/update-flow/index.ts", import.meta.url), "utf8");
  assert.match(createFlow, /visibility === "unlisted" && !user/);
  assert.match(publishFlow, /visibility === "unlisted" && !user/);
  assert.match(updateFlow, /visibility !== currentVisibility && !user/);
});

test("公開処理をコピーしたときは限定公開を初期選択する", async () => {
  const editor = await readFile(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /if \(copyId\)[\s\S]*?visibility: "unlisted"/);
});
