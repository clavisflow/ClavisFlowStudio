import { handleError, HttpError, json, options, bodyJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { buildResponsesRequest, parseAiInputSchemas, parseResponsesResult } from "../_shared/ai-sql.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request);
    const instruction = String(body.instruction ?? "").trim();
    if (!instruction || instruction.length > 4000) throw new HttpError(400, "処理指示は1～4,000文字で指定してください。");
    const inputs = parseAiInputSchemas(body.inputs);
    const baseUrl = (Deno.env.get("OPENAI_COMPATIBLE_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const apiKey = Deno.env.get("OPENAI_COMPATIBLE_API_KEY");
    if (!apiKey) throw new HttpError(503, "AI APIが設定されていません。");
    await enforceRateLimit(request, "generate-sql");
    const model = Deno.env.get("OPENAI_COMPATIBLE_MODEL") ?? "gpt-5.6-terra";
    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildResponsesRequest(model, instruction, inputs, Deno.env.get("OPENAI_REASONING_EFFORT") ?? "low")),
    });
    if (!response.ok) {
      const upstreamBody = (await response.text()).slice(0, 2_000);
      console.error("OpenAI Responses API error", { status: response.status, body: upstreamBody });
      if (response.status === 429) throw new HttpError(503, "AI APIの利用上限に達しました。時間をおいて再度お試しください。");
      if (response.status === 401 || response.status === 403) throw new HttpError(503, "AI APIの認証設定を確認してください。");
      throw new HttpError(502, "AI APIの呼び出しに失敗しました。");
    }
    const result = await response.json();
    return json(request, parseResponsesResult(result, inputs));
  } catch (error) { return handleError(request, error); }
});
