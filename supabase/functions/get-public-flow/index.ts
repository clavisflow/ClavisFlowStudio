import { adminClient } from "../_shared/db.ts";
import { handleError, HttpError, json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "GET") throw new HttpError(405, "GETのみ利用できます。");
    const publicId = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(publicId)) throw new HttpError(400, "公開IDが不正です。");
    const db = adminClient();
    const { data: flow, error } = await db.from("flows").select("id,public_id,name,description,current_published_version").eq("public_id", publicId).eq("status", "published").maybeSingle();
    if (error) throw error;
    if (!flow || !flow.current_published_version) throw new HttpError(404, "公開フローが見つかりません。");
    const { data: version, error: versionError } = await db.from("flow_versions").select("version_number,instruction,input_definition,sql,output_definition,duckdb_version").eq("flow_id", flow.id).eq("version_number", flow.current_published_version).not("published_at", "is", null).single();
    if (versionError) throw versionError;
    return json(request, { publicId: flow.public_id, name: flow.name, description: flow.description, version: version.version_number, instruction: version.instruction, inputs: version.input_definition, sql: version.sql, output: version.output_definition, duckdbVersion: version.duckdb_version }, 200);
  } catch (error) { return handleError(request, error); }
});
