import { handleError, HttpError, json, options, bodyJson } from "../_shared/http.ts";
import { assertSafeSql } from "../_shared/validation.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (request) => {
  const preflight = options(request); if (preflight) return preflight;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POSTのみ利用できます。");
    const body = await bodyJson(request);
    const instruction = String(body.instruction ?? "").trim();
    if (!instruction || instruction.length > 4000) throw new HttpError(400, "処理指示は1～4,000文字で指定してください。");
    if (!Array.isArray(body.inputs) || body.inputs.length < 1 || body.inputs.length > 2) throw new HttpError(400, "入力スキーマが必要です。");
    const baseUrl = (Deno.env.get("OPENAI_COMPATIBLE_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const apiKey = Deno.env.get("OPENAI_COMPATIBLE_API_KEY");
    if (!apiKey) throw new HttpError(503, "AI APIが設定されていません。");
    await enforceRateLimit(request, "generate-sql");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_COMPATIBLE_MODEL") ?? "gpt-5-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "You generate exactly one read-only DuckDB SELECT query. Use only the supplied table and column names. Never use file readers, URLs, COPY, PRAGMA, extensions, DDL, or DML. Return SQL only." },
          { role: "user", content: `入力スキーマ:\n${JSON.stringify(body.inputs)}\n\n処理指示:\n${instruction}` },
        ],
      }),
    });
    if (!response.ok) throw new HttpError(502, "AI APIの呼び出しに失敗しました。");
    const result = await response.json();
    const sql = String(result?.choices?.[0]?.message?.content ?? "").replace(/^```(?:sql)?\s*/i, "").replace(/\s*```$/, "").trim();
    assertSafeSql(sql);
    return json(request, { sql });
  } catch (error) { return handleError(request, error); }
});
