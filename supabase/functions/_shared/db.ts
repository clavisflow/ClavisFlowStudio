import { createClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export const ADMIN_EMAIL = "clavisflow@gmail.com";

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

export async function optionalUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return;
  const db = adminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "ログイン情報を確認できませんでした。");
  return data.user;
}

export async function requireUser(request: Request) {
  const user = await optionalUser(request);
  if (!user) throw new HttpError(401, "この操作にはログインが必要です。");
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (!user.email_confirmed_at || user.email?.trim().toLowerCase() !== ADMIN_EMAIL) {
    throw new HttpError(403, "管理者だけがこの操作を実行できます。");
  }
  return user;
}

export function userDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const value = [metadata.display_name, metadata.full_name, metadata.name].find((candidate) => typeof candidate === "string" && candidate.trim());
  const name = typeof value === "string" ? value.trim() : user.email?.trim();
  return (name || "ログインユーザー").slice(0, 160);
}
