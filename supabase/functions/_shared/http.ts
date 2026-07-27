import { HttpError } from "./errors.ts";

export { HttpError } from "./errors.ts";

export function corsHeaders(request: Request): Record<string, string> {
  const allowed = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
  const requested = request.headers.get("origin") ?? "";
  const origin = allowed === "*" || allowed.split(",").map((x) => x.trim()).includes(requested)
    ? (allowed === "*" ? "*" : requested)
    : allowed.split(",")[0].trim();
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-edit-token, x-clavis-client-id",
    "Access-Control-Expose-Headers": "Retry-After",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

export function options(request: Request): Response | undefined {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function json(request: Request, body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), ...headers } });
}

export function handleError(request: Request, error: unknown): Response {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (status === 500) console.error(error);
  return json(request, { error: status === 500 ? "サーバー処理に失敗しました。" : message }, status, error instanceof HttpError ? error.headers : {});
}

export async function bodyJson(request: Request): Promise<Record<string, unknown>> {
  try { return await request.json(); }
  catch { throw new HttpError(400, "JSONリクエストが不正です。"); }
}
