import { adminClient, requireUser } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";

const MAX_KEYS = 100;
const MAX_SYNC_RECORDS = 100;
const PROCESS_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;
const MAX_CLIENT_TIME = 4102444800000;

type FavoriteInput = {
  processKey: string;
  active: boolean;
  updatedAt: number;
  name: string;
  description: string;
  href: string;
};

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method === "GET") {
      const processKeys = normalizeProcessKeys(new URL(request.url).searchParams.getAll("id"));
      return json(request, { counts: await favoriteCounts(processKeys) });
    }
    if (request.method !== "POST") throw new HttpError(405, "GETまたはPOSTのみ利用できます。");

    const user = await requireUser(request);
    const body = await bodyJson(request);
    const favorites = normalizeFavorites(body.favorites);
    const requestedKeys = normalizeProcessKeys(Array.isArray(body.processKeys) ? body.processKeys : []);
    const db = adminClient();
    const { data: stored, error: storedError } = await db.from("flow_favorites")
      .select("process_key,active,client_updated_at,name,description,href")
      .eq("user_id", user.id)
      .limit(500);
    if (storedError) throw storedError;

    const storedByKey = new Map((stored ?? []).map((record) => [record.process_key, record]));
    const updates = favorites.filter((favorite) => {
      const remote = storedByKey.get(favorite.processKey);
      return !remote || favorite.updatedAt > Number(remote.client_updated_at);
    }).map((favorite) => ({
      user_id: user.id,
      process_key: favorite.processKey,
      active: favorite.active,
      client_updated_at: favorite.updatedAt,
      name: favorite.name,
      description: favorite.description,
      href: favorite.href,
    }));

    if (updates.length) {
      const { error: updateError } = await db.from("flow_favorites").upsert(updates, { onConflict: "user_id,process_key" });
      if (updateError) throw updateError;
    }

    const { data: synchronized, error: synchronizedError } = await db.from("flow_favorites")
      .select("process_key,active,client_updated_at,name,description,href")
      .eq("user_id", user.id)
      .limit(500);
    if (synchronizedError) throw synchronizedError;
    return json(request, {
      favorites: (synchronized ?? []).map((favorite) => ({
        processKey: favorite.process_key,
        active: favorite.active,
        updatedAt: Number(favorite.client_updated_at),
        name: favorite.name || undefined,
        description: favorite.description || undefined,
        href: favorite.href || undefined,
      })),
      counts: await favoriteCounts(requestedKeys),
    });
  } catch (error) { return handleError(request, error); }
});

function normalizeProcessKeys(values: unknown[]) {
  const processKeys = [...new Set(values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter((value) => PROCESS_KEY_PATTERN.test(value)))];
  if (processKeys.length > MAX_KEYS) throw new HttpError(400, `処理IDは${MAX_KEYS}件まで指定できます。`);
  return processKeys;
}

function normalizeFavorites(value: unknown): FavoriteInput[] {
  if (!Array.isArray(value)) throw new HttpError(400, "お気に入り情報が不正です。");
  if (value.length > MAX_SYNC_RECORDS) throw new HttpError(400, `お気に入りは${MAX_SYNC_RECORDS}件まで同期できます。`);
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new HttpError(400, "お気に入り情報が不正です。");
    const record = candidate as Record<string, unknown>;
    const processKey = typeof record.processKey === "string" ? record.processKey.trim() : "";
    const updatedAt = Number(record.updatedAt);
    if (!PROCESS_KEY_PATTERN.test(processKey) || typeof record.active !== "boolean" || !Number.isSafeInteger(updatedAt) || updatedAt < 1 || updatedAt > MAX_CLIENT_TIME) {
      throw new HttpError(400, "お気に入り情報が不正です。");
    }
    return {
      processKey,
      active: record.active,
      updatedAt,
      name: text(record.name, 120),
      description: text(record.description, 2000),
      href: text(record.href, 2048),
    };
  });
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

async function favoriteCounts(processKeys: string[]) {
  if (!processKeys.length) return {};
  const db = adminClient();
  const { data, error } = await db.rpc("flow_favorite_counts", { requested_keys: processKeys });
  if (error) throw error;
  return Object.fromEntries(processKeys.map((processKey) => [processKey, Number(data?.find((record) => record.process_key === processKey)?.favorite_count ?? 0)]));
}
