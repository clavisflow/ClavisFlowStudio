import { adminClient } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const MAX_KEYS = 100;
const PROCESS_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method === "GET") {
      const processKeys = normalizeProcessKeys(new URL(request.url).searchParams.getAll("id"));
      return json(request, { counts: await usageCounts(processKeys) });
    }
    if (request.method !== "POST") throw new HttpError(405, "GETまたはPOSTのみ利用できます。");

    const body = await bodyJson(request);
    const processKey = typeof body.processKey === "string" ? body.processKey.trim() : "";
    const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
    if (!PROCESS_KEY_PATTERN.test(processKey) || !UUID_PATTERN.test(eventId)) throw new HttpError(400, "利用情報が不正です。");

    await enforceRateLimit(request, "flow-usage");
    const { data, error } = await adminClient().rpc("record_flow_usage", { p_event_id: eventId, p_process_key: processKey });
    if (error) throw error;
    return json(request, { recorded: Boolean(data) }, 201);
  } catch (error) { return handleError(request, error); }
});

function normalizeProcessKeys(values: unknown[]) {
  const processKeys = [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter((value) => PROCESS_KEY_PATTERN.test(value)))];
  if (processKeys.length > MAX_KEYS) throw new HttpError(400, `処理IDは${MAX_KEYS}件まで指定できます。`);
  return processKeys;
}

async function usageCounts(processKeys: string[]) {
  if (!processKeys.length) return {};
  const { data, error } = await adminClient().rpc("flow_usage_counts", { requested_keys: processKeys });
  if (error) throw error;
  const rows = new Map((data ?? []).map((record) => [record.process_key, record]));
  return Object.fromEntries(processKeys.map((processKey) => {
    const record = rows.get(processKey);
    return [processKey, { total: Number(record?.total_runs ?? 0), recent: Number(record?.recent_runs ?? 0) }];
  }));
}
