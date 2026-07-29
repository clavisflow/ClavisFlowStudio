"use client";

import { getPortalActivitySnapshot, mergeRemoteFavoriteRecords, type FavoriteRecord } from "./portal-activity.ts";
import { currentAccessToken } from "./supabase-browser.ts";

export type FavoriteCounts = Record<string, number>;

type FavoriteSyncResponse = {
  favorites: Array<FavoriteRecord & { processKey: string }>;
  counts: FavoriteCounts;
};

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
}

function normalizeProcessKeys(processKeys: string[]) {
  return [...new Set(processKeys.filter((processKey) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(processKey)))].slice(0, 100);
}

async function favoriteRequest<T>(path: string, init: RequestInit = {}) {
  const baseUrl = supabaseUrl();
  if (!baseUrl) return;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) headers.set("apikey", anonKey);
  const response = await fetch(`${baseUrl}/functions/v1/flow-favorites${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "お気に入り情報を取得できませんでした。");
  return body as T;
}

export async function loadFavoriteCounts(processKeys: string[]): Promise<FavoriteCounts> {
  const normalized = normalizeProcessKeys(processKeys);
  if (!normalized.length || !supabaseUrl()) return {};
  const parameters = new URLSearchParams();
  normalized.forEach((processKey) => parameters.append("id", processKey));
  return (await favoriteRequest<{ counts: FavoriteCounts }>(`?${parameters.toString()}`))?.counts ?? {};
}

export async function syncPortalFavorites(processKeys: string[], userId: string): Promise<FavoriteCounts> {
  const normalized = normalizeProcessKeys(processKeys);
  const accessToken = await currentAccessToken();
  if (!accessToken) return loadFavoriteCounts(normalized);
  const favorites = Object.entries(getPortalActivitySnapshot().favorites)
    .filter(([, favorite]) => !favorite.ownerId || favorite.ownerId === userId)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, 100)
    .map(([processKey, favorite]) => ({ processKey, ...favorite }));
  const result = await favoriteRequest<FavoriteSyncResponse>("", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ processKeys: normalized, favorites }),
  });
  if (!result) return {};
  mergeRemoteFavoriteRecords(Object.fromEntries(result.favorites.map(({ processKey, ...favorite }) => [processKey, favorite])), userId);
  return result.counts;
}
