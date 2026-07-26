import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./http.ts";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function requireEditor(publicId: string, token: string) {
  if (!token) throw new HttpError(401, "編集トークンが必要です。");
  const db = adminClient();
  const hash = await sha256Hex(token);
  const { data, error } = await db.from("flows").select("*").eq("public_id", publicId).eq("edit_token_hash", hash).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(403, "編集トークンが正しくありません。");
  return { db, flow: data };
}
