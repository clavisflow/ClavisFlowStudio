import { adminClient } from "./db.ts";
import { HttpError } from "./http.ts";

type Action = "create-flow" | "generate-sql" | "flow-usage";
type Limit = { scope: "browser" | "ip" | "global"; windowSeconds: number; maximum: number };

const limits: Record<Action, Limit[]> = {
  "create-flow": [
    { scope: "browser", windowSeconds: 600, maximum: 3 },
    { scope: "browser", windowSeconds: 86400, maximum: 20 },
    { scope: "ip", windowSeconds: 600, maximum: 10 },
    { scope: "ip", windowSeconds: 86400, maximum: 100 },
    { scope: "global", windowSeconds: 86400, maximum: 500 },
  ],
  "generate-sql": [
    { scope: "browser", windowSeconds: 60, maximum: 2 },
    { scope: "browser", windowSeconds: 3600, maximum: 10 },
    { scope: "browser", windowSeconds: 86400, maximum: 30 },
    { scope: "ip", windowSeconds: 60, maximum: 6 },
    { scope: "ip", windowSeconds: 3600, maximum: 60 },
    { scope: "ip", windowSeconds: 86400, maximum: 150 },
    { scope: "global", windowSeconds: 86400, maximum: 100 },
  ],
  "flow-usage": [
    { scope: "browser", windowSeconds: 60, maximum: 60 },
    { scope: "browser", windowSeconds: 86400, maximum: 1000 },
    { scope: "ip", windowSeconds: 60, maximum: 300 },
    { scope: "ip", windowSeconds: 86400, maximum: 10000 },
    { scope: "global", windowSeconds: 86400, maximum: 100000 },
  ],
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
};

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded
    || request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function browserId(request: Request, ip: string): string {
  const supplied = request.headers.get("x-clavis-client-id")?.trim() ?? "";
  return /^[a-f0-9]{32}$/i.test(supplied) ? supplied.toLowerCase() : `missing:${ip}`;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(request: Request, action: Action): Promise<void> {
  const secret = Deno.env.get("RATE_LIMIT_HASH_SECRET");
  if (!secret || secret.length < 32) {
    console.error("RATE_LIMIT_HASH_SECRET must contain at least 32 characters");
    throw new HttpError(503, "利用回数の確認処理を開始できませんでした。しばらくしてからお試しください。");
  }

  const ip = clientIp(request);
  const browser = browserId(request, ip);
  const identifiers = {
    browser: await hmacHex(secret, `browser:${browser}`),
    ip: await hmacHex(secret, `ip:${ip}`),
    global: await hmacHex(secret, "global"),
  };
  const db = adminClient();

  for (const limit of limits[action]) {
    const { data, error } = await db.rpc("consume_api_rate_limit", {
      p_action: action,
      p_identifier_hash: identifiers[limit.scope],
      p_window_seconds: limit.windowSeconds,
      p_max_requests: limit.maximum,
    });
    if (error) {
      console.error("Rate limit RPC failed", error);
      throw new HttpError(503, "利用回数の確認処理に失敗しました。しばらくしてからお試しください。");
    }
    const result = (data as RateLimitResult[] | null)?.[0];
    if (!result) throw new HttpError(503, "利用回数の確認処理に失敗しました。しばらくしてからお試しください。");
    if (!result.allowed) {
      const seconds = Math.max(1, result.retry_after_seconds);
      const wait = seconds >= 3600
        ? `${Math.ceil(seconds / 3600)}時間ほど`
        : seconds >= 60 ? `${Math.ceil(seconds / 60)}分ほど` : `${seconds}秒ほど`;
      throw new HttpError(429, `利用回数の上限に達しました。${wait}待ってからもう一度お試しください。`, {
        "Retry-After": String(seconds),
      });
    }
  }
}
