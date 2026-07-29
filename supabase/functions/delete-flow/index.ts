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
    const { data: samples } = await db.from("flow_samples").select("storage_path").eq("flow_id", flow.id);
    if (samples?.length) {
      const { error: storageError } = await db.storage.from("flow-samples").remove(samples.map((sample) => sample.storage_path));
      if (storageError) throw storageError;
    }
    const { error } = await db.from("flows").delete().eq("id", flow.id);
    if (error) throw error;
    return json(request, { publicId, deleted: true });
  } catch (error) { return handleError(request, error); }
});
