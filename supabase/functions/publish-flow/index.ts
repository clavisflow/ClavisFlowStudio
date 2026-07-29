import { adminClient, optionalUser, requireEditor, userDisplayName } from "../_shared/db.ts";
import { bodyJson, handleError, HttpError, json, options } from "../_shared/http.ts";
import { assertSafeSql, flowVisibility } from "../_shared/validation.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request);
    const publicId = String(body.publicId ?? ""), version = Number(body.version);
    const { db, flow } = await requireEditor(publicId, request.headers.get("x-edit-token") ?? String(body.editToken ?? ""));
    const user = await optionalUser(request);
    const currentVisibility = flowVisibility(flow.visibility);
    const visibility = flowVisibility(body.visibility, currentVisibility);
    if (visibility !== currentVisibility && !user) throw new HttpError(401, "公開範囲を変更するにはログインしてください。");
    if (visibility === "unlisted" && !user) throw new HttpError(401, "限定公開にするにはログインしてください。");
    if (flow.owner_user_id && user && flow.owner_user_id !== user.id) throw new HttpError(403, "この処理の所有者としてログインしてください。");
    const { data: definition, error: findError } = await db.from("flow_versions").select("sql,published_at").eq("flow_id", flow.id).eq("version_number", version).maybeSingle();
    if (findError) throw findError;
    if (!definition) throw new HttpError(404, "指定バージョンがありません。");
    assertSafeSql(definition.sql);
    if (!definition.published_at) {
      const { error } = await db.from("flow_versions").update({
        published_at: new Date().toISOString(),
        updated_by_name: user ? userDisplayName(user) : null,
      }).eq("flow_id", flow.id).eq("version_number", version);
      if (error) throw error;
    }
    const changes: Record<string, unknown> = { status: "published", current_published_version: version, visibility };
    if (!flow.owner_user_id && user) changes.owner_user_id = user.id;
    const { error } = await db.from("flows").update(changes).eq("id", flow.id);
    if (error) throw error;
    await removeObsoleteSamples(db, flow.id, version);
    return json(request, { publicId, version, status: "published", visibility });
  } catch (error) { return handleError(request, error); }
});

async function removeObsoleteSamples(db: ReturnType<typeof adminClient>, flowId: string, version: number) {
  const { data, error } = await db.from("flow_samples").select("id,storage_path").eq("flow_id", flowId).neq("version_number", version);
  if (error || !data?.length) return;
  const paths = data.map((sample) => sample.storage_path);
  const { error: storageError } = await db.storage.from("flow-samples").remove(paths);
  if (storageError) {
    console.error(storageError);
    return;
  }
  const { error: deleteError } = await db.from("flow_samples").delete().in("id", data.map((sample) => sample.id));
  if (deleteError) console.error(deleteError);
}
