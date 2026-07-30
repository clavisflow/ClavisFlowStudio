import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("利用回数は全ユーザーの成功実行を日次で累積する", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202607300010_add_flow_usage.sql", import.meta.url), "utf8");
  assert.match(migration, /primary key \(process_key, usage_date\)/);
  assert.match(migration, /successful_runs = public\.flow_usage_daily\.successful_runs \+ 1/);
  assert.match(migration, /sum\(daily\.successful_runs\).*total_runs/s);
  assert.match(migration, /usage_date >= current_date - 29/);
  assert.match(migration, /event_id uuid primary key/);
  assert.match(migration, /no user or input data is stored/i);
});

test("利用回数APIは重複防止IDを記録し集計値を返す", async () => {
  const usageFunction = await readFile(new URL("../supabase/functions/flow-usage/index.ts", import.meta.url), "utf8");
  assert.match(usageFunction, /enforceRateLimit\(request, "flow-usage"\)/);
  assert.match(usageFunction, /rpc\("record_flow_usage"/);
  assert.match(usageFunction, /rpc\("flow_usage_counts"/);
});

test("処理成功時だけサーバー利用回数を記録する", async () => {
  const runner = await readFile(new URL("../components/flow-runner.tsx", import.meta.url), "utf8");
  const successPosition = runner.indexOf('setExecutionStatus("success")');
  const recordPosition = runner.indexOf("recordFlowUsage(flow.publicId)");
  const failurePosition = runner.indexOf('setExecutionStatus("failure")');
  assert.ok(successPosition >= 0 && recordPosition > successPosition && failurePosition > recordPosition);
});

test("おすすめは直近利用とお気に入りで計算し表示件数は累計を使う", async () => {
  const portal = await readFile(new URL("../components/processing-portal.tsx", import.meta.url), "utf8");
  assert.match(portal, /\[\.\.\.publicItems, \.\.\.officialItems\]/);
  assert.match(portal, /Math\.log1p\(usageCounts\[item\.id\]\?\.recent \?\? 0\) \+ 4 \* Math\.log1p/);
  assert.match(portal, /\.slice\(0, 4\)/);
  assert.match(portal, /uses=\{usageCounts\[item\.id\]\?\.total \?\? 0\}/);
});
