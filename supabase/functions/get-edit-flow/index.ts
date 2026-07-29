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
      .select("version_number,instruction,ai_sample_definition,input_definition,sql,output_definition,duckdb_version")
      .eq("flow_id", flow.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    const { data: samples, error: sampleError } = await db.from("flow_samples")
      .select("input_id,file_name,byte_size")
      .eq("flow_id", flow.id)
      .eq("version_number", version.version_number);
    if (sampleError) throw sampleError;
    const functionOrigin = (Deno.env.get("SUPABASE_URL") ?? new URL(request.url).origin).replace(/^http:\/\//i, "https://");
    return json(request, {
      publicId: flow.public_id,
      name: flow.name,
      description: flow.description,
      categories: flow.categories ?? [],
      visibility: flow.visibility ?? "public",
      status: flow.status,
      version: version.version_number,
      instruction: version.instruction,
      aiSamples: version.ai_sample_definition,
      inputs: version.input_definition,
      sql: version.sql,
      output: version.output_definition,
      duckdbVersion: version.duckdb_version,
      samples: (samples ?? []).map((sample) => ({
        inputId: sample.input_id,
        fileName: sample.file_name,
        byteSize: sample.byte_size,
        url: `${functionOrigin}/functions/v1/get-flow-sample?flow=${encodeURIComponent(flow.public_id)}&version=${version.version_number}&input=${encodeURIComponent(sample.input_id)}`,
      })),
    });
  } catch (error) { return handleError(request, error); }
});
