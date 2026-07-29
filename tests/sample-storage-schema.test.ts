import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202607290005_add_authored_samples.sql", import.meta.url), "utf8");
const uploadFunction = readFileSync(new URL("../supabase/functions/upload-flow-sample/index.ts", import.meta.url), "utf8");
const unpublishFunction = readFileSync(new URL("../supabase/functions/unpublish-flow/index.ts", import.meta.url), "utf8");
const getEditFunction = readFileSync(new URL("../supabase/functions/get-edit-flow/index.ts", import.meta.url), "utf8");
const getSampleFunction = readFileSync(new URL("../supabase/functions/get-flow-sample/index.ts", import.meta.url), "utf8");

test("StorageとDBの両方でサンプルサイズと所有者を制約する", () => {
  assert.match(migration, /byte_size integer not null check \(byte_size between 1 and 5242880\)/);
  assert.match(migration, /file_size_limit,\s*allowed_mime_types/);
  assert.match(migration, /created_by uuid not null references auth\.users/);
  assert.match(migration, /owner_user_id uuid references auth\.users/);
});

test("公開サンプルのサービス全体容量を500MBで停止する", () => {
  assert.match(uploadFunction, /MAX_STORAGE_BYTES = 500 \* 1024 \* 1024/);
  assert.match(uploadFunction, /currentStorageBytes - Number\(existing\?\.byte_size \?\? 0\) \+ fileValue\.size > MAX_STORAGE_BYTES/);
});

test("公開停止後も編集トークンで登録済みサンプルを取得できる", () => {
  assert.doesNotMatch(unpublishFunction, /flow_samples|storage\.from/);
  assert.match(getEditFunction, /from\("flow_samples"\)/);
  assert.match(getEditFunction, /version=\$\{version\.version_number\}/);
  assert.match(getSampleFunction, /request\.headers\.get\("x-edit-token"\)/);
  assert.match(getSampleFunction, /requireEditor\(publicId, editToken\)/);
  assert.match(getSampleFunction, /"Cache-Control": editToken \? "private, no-store"/);
});
