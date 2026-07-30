import { adminClient, requireAdmin, requireEditor } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request);
    const publicId = String(body.publicId ?? "").trim();
    if (!publicId) throw new HttpError(400, "公開IDが必要です。");
    const token = request.headers.get("x-edit-token") ?? String(body.editToken ?? "");
    let db: ReturnType<typeof adminClient>;
    let flow: { id: string };
    if (token) {
      ({ db, flow } = await requireEditor(publicId, token));
    } else {
      await requireAdmin(request);
      db = adminClient();
      const { data, error } = await db.from("flows").select("id").eq("public_id", publicId).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "公開処理が見つかりません。");
      flow = data;
    }
    const { data: samples, error: samplesError } = await db.from("flow_samples").select("storage_path").eq("flow_id", flow.id);
    if (samplesError) throw samplesError;
    if (samples?.length) {
      const { error: storageError } = await db.storage.from("flow-samples").remove(samples.map((sample) => sample.storage_path));
      if (storageError) throw storageError;
    }
    const { data: deleted, error } = await db.rpc("delete_flow_completely", { p_flow_id: flow.id, p_process_key: publicId });
    if (error) throw error;
    if (!deleted) throw new HttpError(404, "公開処理が見つかりません。");
    return json(request, { publicId, deleted: true });
  } catch (error) { return handleError(request, error); }
});
