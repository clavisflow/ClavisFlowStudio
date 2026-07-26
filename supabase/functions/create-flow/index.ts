import { adminClient, createToken, sha256Hex } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";
import { assertDefinition } from "../_shared/validation.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request); assertDefinition(body);
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 120) throw new HttpError(400, "フロー名は1～120文字で指定してください。");
    const description = String(body.description ?? "").slice(0, 2000);
    await enforceRateLimit(request, "create-flow");
    const token = createToken();
    const publicId = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const db = adminClient();
    const { data: flow, error: flowError } = await db.from("flows").insert({ public_id: publicId, edit_token_hash: await sha256Hex(token), name, description }).select("id").single();
    if (flowError) throw flowError;
    const { error: versionError } = await db.from("flow_versions").insert({ flow_id: flow.id, version_number: 1, instruction: String(body.instruction ?? "").slice(0, 4000), input_definition: body.inputs, sql: body.sql, output_definition: body.output, duckdb_version: String(body.duckdbVersion ?? "1.32.0") });
    if (versionError) { await db.from("flows").delete().eq("id", flow.id); throw versionError; }
    const appUrl = (Deno.env.get("PUBLIC_APP_URL") ?? "https://studio.clavisflow.net").replace(/\/$/, "");
    return json(request, { publicId, editToken: token, publicUrl: `${appUrl}/run/?flow=${publicId}`, editUrl: `${appUrl}/flows/edit/?flow=${publicId}#token=${token}`, version: 1 }, 201);
  } catch (error) { return handleError(request, error); }
});
