import { requireEditor, requireUser } from "../_shared/db.ts";
import { handleError, HttpError, json, options } from "../_shared/http.ts";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FLOW_BYTES = 10 * 1024 * 1024;
const MAX_STORAGE_BYTES = 500 * 1024 * 1024;
const allowedExtensions = new Set(["csv", "xlsx", "json"]);
const contentTypes: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
};

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const user = await requireUser(request);
    const form = await request.formData();
    const publicId = String(form.get("publicId") ?? "");
    const version = Number(form.get("version"));
    const inputId = String(form.get("inputId") ?? "");
    const fileValue = form.get("file");
    if (!(fileValue instanceof File)) throw new HttpError(400, "サンプルファイルが必要です。");
    if (!Number.isInteger(version) || version < 1) throw new HttpError(400, "バージョンが不正です。");
    if (!inputId || inputId.length > 100) throw new HttpError(400, "入力元が不正です。");
    if (fileValue.size < 1 || fileValue.size > MAX_FILE_BYTES) throw new HttpError(413, "サンプルは1ファイル5MB以下にしてください。");

    const extension = fileValue.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.has(extension)) throw new HttpError(400, "サンプルはCSV、Excel（.xlsx）、JSONに対応しています。");

    const token = request.headers.get("x-edit-token") ?? String(form.get("editToken") ?? "");
    const { db, flow } = await requireEditor(publicId, token);
    if (flow.owner_user_id && flow.owner_user_id !== user.id) throw new HttpError(403, "この処理の所有者としてログインしてください。");
    if (!flow.owner_user_id) {
      const { error: claimError } = await db.from("flows").update({ owner_user_id: user.id }).eq("id", flow.id).is("owner_user_id", null);
      if (claimError) throw claimError;
    }

    const { data: definition, error: definitionError } = await db.from("flow_versions")
      .select("input_definition,published_at")
      .eq("flow_id", flow.id)
      .eq("version_number", version)
      .maybeSingle();
    if (definitionError) throw definitionError;
    if (!definition) throw new HttpError(404, "公開予定のバージョンが見つかりません。");
    if (definition.published_at) throw new HttpError(409, "公開済みバージョンのサンプルは変更できません。新しいバージョンを作成してください。");
    const inputs = Array.isArray(definition.input_definition) ? definition.input_definition as Array<Record<string, unknown>> : [];
    if (!inputs.some((input) => input.id === inputId)) throw new HttpError(400, "処理に存在しない入力元です。");

    const { data: samples, error: samplesError } = await db.from("flow_samples")
      .select("input_id,byte_size,storage_path")
      .eq("flow_id", flow.id)
      .eq("version_number", version);
    if (samplesError) throw samplesError;
    const otherBytes = (samples ?? []).filter((sample) => sample.input_id !== inputId).reduce((sum, sample) => sum + sample.byte_size, 0);
    if (otherBytes + fileValue.size > MAX_FLOW_BYTES) throw new HttpError(413, "1処理のサンプル合計は10MB以下にしてください。");

    const existing = (samples ?? []).find((sample) => sample.input_id === inputId);
    const { data: allSamples, error: allSamplesError } = await db.from("flow_samples").select("byte_size");
    if (allSamplesError) throw allSamplesError;
    const currentStorageBytes = (allSamples ?? []).reduce((sum, sample) => sum + Number(sample.byte_size), 0);
    if (currentStorageBytes - Number(existing?.byte_size ?? 0) + fileValue.size > MAX_STORAGE_BYTES) {
      throw new HttpError(507, "公開サンプルの保存容量が上限に達しました。");
    }

    const safeInputId = inputId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
    const storagePath = `${flow.id}/${version}/${safeInputId}/${crypto.randomUUID()}.${extension}`;
    const contentType = contentTypes[extension];
    const uploadBody = new Blob([await fileValue.arrayBuffer()], { type: contentType });
    const { error: uploadError } = await db.storage.from("flow-samples").upload(storagePath, uploadBody, { contentType, upsert: false });
    if (uploadError) throw new HttpError(503, `サンプルをStorageへ保存できませんでした: ${uploadError.message}`);

    const { data: saved, error: saveError } = await db.from("flow_samples").upsert({
      flow_id: flow.id,
      version_number: version,
      input_id: inputId,
      storage_path: storagePath,
      file_name: fileValue.name.slice(-180),
      content_type: contentType,
      byte_size: fileValue.size,
      created_by: user.id,
    }, { onConflict: "flow_id,version_number,input_id" }).select("input_id,file_name,byte_size").single();
    if (saveError) {
      await db.storage.from("flow-samples").remove([storagePath]);
      throw new HttpError(503, `サンプル情報を保存できませんでした: ${saveError.message}`);
    }
    if (existing?.storage_path) await db.storage.from("flow-samples").remove([existing.storage_path]);
    return json(request, { inputId: saved.input_id, fileName: saved.file_name, byteSize: saved.byte_size }, 201);
  } catch (error) { return handleError(request, error); }
});
