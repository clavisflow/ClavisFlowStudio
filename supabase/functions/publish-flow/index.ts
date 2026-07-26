import { requireEditor } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";
import { assertSafeSql } from "../_shared/validation.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request);
    const publicId = String(body.publicId ?? ""), version = Number(body.version);
    const { db, flow } = await requireEditor(publicId, request.headers.get("x-edit-token") ?? String(body.editToken ?? ""));
    const { data: definition, error: findError } = await db.from("flow_versions").select("sql,published_at").eq("flow_id", flow.id).eq("version_number", version).maybeSingle();
    if (findError) throw findError;
    if (!definition) throw new HttpError(404, "指定バージョンがありません。");
    assertSafeSql(definition.sql);
    if (!definition.published_at) { const { error } = await db.from("flow_versions").update({ published_at: new Date().toISOString() }).eq("flow_id", flow.id).eq("version_number", version); if (error) throw error; }
    const { error } = await db.from("flows").update({ status: "published", current_published_version: version }).eq("id", flow.id);
    if (error) throw error;
    return json(request, { publicId, version, status: "published" });
  } catch (error) { return handleError(request, error); }
});
