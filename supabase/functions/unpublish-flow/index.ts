import { requireEditor } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request); const publicId = String(body.publicId ?? "");
    const { db, flow } = await requireEditor(publicId, request.headers.get("x-edit-token") ?? String(body.editToken ?? ""));
    const { error } = await db.from("flows").update({ status: "unpublished" }).eq("id", flow.id);
    if (error) throw error;
    return json(request, { publicId, status: "unpublished" });
  } catch (error) { return handleError(request, error); }
});
