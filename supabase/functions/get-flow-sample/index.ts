import { adminClient, requireEditor } from "../_shared/db.ts";
import { corsHeaders, handleError, HttpError, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "GET") throw new HttpError(405, "GETのみ利用できます。");
    const url = new URL(request.url);
    const publicId = url.searchParams.get("flow") ?? "";
    const inputId = url.searchParams.get("input") ?? "";
    if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(publicId) || !inputId || inputId.length > 100) throw new HttpError(400, "サンプル指定が不正です。");

    const editToken = request.headers.get("x-edit-token") ?? "";
    let db = adminClient();
    let flowId: string;
    let version: number;
    if (editToken) {
      const authorized = await requireEditor(publicId, editToken);
      db = authorized.db;
      flowId = authorized.flow.id;
      version = Number(url.searchParams.get("version") ?? authorized.flow.current_published_version);
      if (!Number.isInteger(version) || version < 1) throw new HttpError(400, "サンプルのバージョンが不正です。");
    } else {
      const { data: flow, error: flowError } = await db.from("flows")
        .select("id,current_published_version")
        .eq("public_id", publicId)
        .eq("status", "published")
        .maybeSingle();
      if (flowError) throw flowError;
      if (!flow?.current_published_version) throw new HttpError(404, "公開処理が見つかりません。");
      flowId = flow.id;
      version = flow.current_published_version;
    }
    const { data: sample, error: sampleError } = await db.from("flow_samples")
      .select("storage_path,file_name,content_type")
      .eq("flow_id", flowId)
      .eq("version_number", version)
      .eq("input_id", inputId)
      .maybeSingle();
    if (sampleError) throw sampleError;
    if (!sample) throw new HttpError(404, "サンプルが見つかりません。");
    const { data, error } = await db.storage.from("flow-samples").download(sample.storage_path);
    if (error || !data) throw error ?? new Error("サンプルを取得できませんでした。");
    const headers = corsHeaders(request);
    return new Response(data, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": sample.content_type,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(sample.file_name)}`,
        "Cache-Control": editToken ? "private, no-store" : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return handleError(request, error); }
});
