import { adminClient } from "../_shared/db.ts";
import { handleError, HttpError, json, options } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "GET") throw new HttpError(405, "GETのみ利用できます。");
    const db = adminClient();
    const { data: flows, error: flowError } = await db.from("flows")
      .select("id,public_id,name,description,categories,current_published_version,updated_at")
      .eq("status", "published")
      .eq("visibility", "public")
      .not("current_published_version", "is", null)
      .order("updated_at", { ascending: false })
      .limit(60);
    if (flowError) throw flowError;

    const flowIds = (flows ?? []).map((flow) => flow.id);
    const { data: versions, error: versionError } = flowIds.length
      ? await db.from("flow_versions").select("flow_id,version_number,input_definition").in("flow_id", flowIds).not("published_at", "is", null)
      : { data: [], error: null };
    if (versionError) throw versionError;
    const currentInputs = new Map(
      (versions ?? []).map((version) => [`${version.flow_id}:${version.version_number}`, version.input_definition]),
    );

    return json(request, {
      flows: (flows ?? []).map((flow) => ({
        publicId: flow.public_id,
        name: flow.name,
        description: flow.description,
        categories: flow.categories ?? [],
        updatedAt: flow.updated_at,
        inputs: currentInputs.get(`${flow.id}:${flow.current_published_version}`) ?? [],
      })),
    });
  } catch (error) { return handleError(request, error); }
});
