"use client";

import { browserClientId } from "./browser-client-id.ts";
import { currentAccessToken } from "./supabase-browser.ts";

export type FlowUsageCounts = Record<string, { total: number; recent: number }>;

const COUNT_BATCH_SIZE = 50;

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
}

function normalizeProcessKeys(processKeys: string[]) {
  return [...new Set(processKeys.filter((processKey) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(processKey)))];
}

async function usageRequest<T>(path: string, init: RequestInit = {}) {
  const baseUrl = supabaseUrl();
  if (!baseUrl) return;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) headers.set("apikey", anonKey);
  const accessToken = await currentAccessToken();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${baseUrl}/functions/v1/flow-usage${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "利用回数を取得できませんでした。");
  return body as T;
}

export async function loadFlowUsageCounts(processKeys: string[]): Promise<FlowUsageCounts> {
  const normalized = normalizeProcessKeys(processKeys);
  if (!normalized.length || !supabaseUrl()) return {};
  const batches: string[][] = [];
  for (let index = 0; index < normalized.length; index += COUNT_BATCH_SIZE) {
    batches.push(normalized.slice(index, index + COUNT_BATCH_SIZE));
  }
  const counts = await Promise.all(batches.map(async (batch) => {
    const parameters = new URLSearchParams();
    batch.forEach((processKey) => parameters.append("id", processKey));
    return (await usageRequest<{ counts: FlowUsageCounts }>(`?${parameters.toString()}`))?.counts ?? {};
  }));
  return Object.assign({}, ...counts);
}

export async function recordFlowUsage(processKey: string) {
  if (!normalizeProcessKeys([processKey]).length || !supabaseUrl()) return;
  await usageRequest("", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-clavis-client-id": browserClientId() },
    body: JSON.stringify({ processKey, eventId: crypto.randomUUID() }),
  });
}
