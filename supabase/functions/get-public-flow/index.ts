import { adminClient } from "../_shared/db.ts";
import { handleError, HttpError, json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "GET") throw new HttpError(405, "GETのみ利用できます。");
    const publicId = new URL(request.url).searchParams.get("id") ?? "";
    if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(publicId)) throw new HttpError(400, "公開IDが不正です。");
    const db = adminClient();
    const { data: flow, error } = await db.from("flows").select("id,public_id,name,description,categories,current_published_version,updated_at").eq("public_id", publicId).eq("status", "published").maybeSingle();
    if (error) throw error;
    if (!flow || !flow.current_published_version) throw new HttpError(404, "公開処理が見つかりません。");
    const { data: version, error: versionError } = await db.from("flow_versions").select("version_number,instruction,input_definition,sql,output_definition,duckdb_version,updated_by_name").eq("flow_id", flow.id).eq("version_number", flow.current_published_version).not("published_at", "is", null).single();
    if (versionError) throw versionError;
    const { data: samples, error: sampleError } = await db.from("flow_samples").select("input_id,file_name,byte_size").eq("flow_id", flow.id).eq("version_number", flow.current_published_version);
    if (sampleError) throw sampleError;
    const functionOrigin = new URL(request.url).origin;
    return json(request, {
      publicId: flow.public_id,
      name: flow.name,
      description: flow.description,
      categories: flow.categories ?? [],
      version: version.version_number,
      updatedAt: flow.updated_at,
      updatedBy: version.updated_by_name,
      instruction: version.instruction,
      inputs: version.input_definition,
      sql: version.sql,
      output: version.output_definition,
      duckdbVersion: version.duckdb_version,
      samples: (samples ?? []).map((sample) => ({
        inputId: sample.input_id,
        fileName: sample.file_name,
        byteSize: sample.byte_size,
        url: `${functionOrigin}/functions/v1/get-flow-sample?flow=${encodeURIComponent(flow.public_id)}&input=${encodeURIComponent(sample.input_id)}`,
      })),
    }, 200);
  } catch (error) { return handleError(request, error); }
});
