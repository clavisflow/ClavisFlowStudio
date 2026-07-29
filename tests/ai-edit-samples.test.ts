import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202607290008_add_ai_edit_samples.sql", import.meta.url), "utf8");
const createFlow = readFileSync(new URL("../supabase/functions/create-flow/index.ts", import.meta.url), "utf8");
const updateFlow = readFileSync(new URL("../supabase/functions/update-flow/index.ts", import.meta.url), "utf8");
const getEditFlow = readFileSync(new URL("../supabase/functions/get-edit-flow/index.ts", import.meta.url), "utf8");
const getPublicFlow = readFileSync(new URL("../supabase/functions/get-public-flow/index.ts", import.meta.url), "utf8");

test("AI編集サンプルを処理バージョンへ容量制限付きで保存する", () => {
  assert.match(migration, /ai_sample_definition jsonb/i);
  assert.match(migration, /pg_column_size\(ai_sample_definition\) <= 262144/i);
  assert.match(createFlow, /ai_sample_definition: body\.aiSamples/);
  assert.match(updateFlow, /ai_sample_definition: body\.aiSamples/);
});

test("AI編集サンプルは編集APIだけから取得でき公開APIには含めない", () => {
  assert.match(getEditFlow, /ai_sample_definition/);
  assert.match(getEditFlow, /aiSamples: version\.ai_sample_definition/);
  assert.doesNotMatch(getPublicFlow, /ai_sample_definition/);
});
