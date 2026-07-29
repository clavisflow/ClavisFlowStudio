import { requireEditor } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request);
    const publicId = String(body.publicId ?? "");
    const token = request.headers.get("x-edit-token") ?? String(body.editToken ?? "");
    const { db, flow } = await requireEditor(publicId, token);
    const { data: version, error } = await db.from("flow_versions")
      .select("version_number,instruction,input_definition,sql,output_definition,duckdb_version")
      .eq("flow_id", flow.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    return json(request, {
      publicId: flow.public_id,
      name: flow.name,
      description: flow.description,
      categories: flow.categories ?? [],
      status: flow.status,
      version: version.version_number,
      instruction: version.instruction,
      inputs: version.input_definition,
      sql: version.sql,
      output: version.output_definition,
      duckdbVersion: version.duckdb_version,
    });
  } catch (error) { return handleError(request, error); }
});
