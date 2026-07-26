import { requireEditor } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";
import { assertDefinition } from "../_shared/validation.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request); assertDefinition(body);
    const publicId = String(body.publicId ?? "");
    const token = request.headers.get("x-edit-token") ?? String(body.editToken ?? "");
    const { db, flow } = await requireEditor(publicId, token);
    const { data: latest, error: latestError } = await db.from("flow_versions").select("version_number").eq("flow_id", flow.id).order("version_number", { ascending: false }).limit(1).single();
    if (latestError) throw latestError;
    const version = latest.version_number + 1;
    const { error } = await db.from("flow_versions").insert({ flow_id: flow.id, version_number: version, instruction: String(body.instruction ?? "").slice(0, 4000), input_definition: body.inputs, sql: body.sql, output_definition: body.output, duckdb_version: String(body.duckdbVersion ?? "1.32.0") });
    if (error) throw error;
    const changes: Record<string, string> = {};
    if (typeof body.name === "string") changes.name = body.name.slice(0, 120);
    if (typeof body.description === "string") changes.description = body.description.slice(0, 2000);
    if (Object.keys(changes).length) { const { error: updateError } = await db.from("flows").update(changes).eq("id", flow.id); if (updateError) throw updateError; }
    return json(request, { publicId, version });
  } catch (error) { return handleError(request, error); }
});
