import { getBundledDemo } from "./demo-flow.ts";
import type { AiSampleRow, FlowDraft, FlowSample, FlowStatus, FlowVisibility, ManagedFlow, PublicFlow, PublicFlowSummary } from "./flow-types.ts";
import { currentAccessToken, getSupabaseBrowserClient } from "./supabase-browser.ts";

const STORAGE_KEY = "clavisflow-studio:managed-flows:v1";
const CLIENT_ID_KEY = "clavisflow-studio:anonymous-client-id:v1";

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
}

function readAll(): ManagedFlow[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeAll(flows: ManagedFlow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
}

function upsert(flow: ManagedFlow) {
  const flows = readAll();
  const index = flows.findIndex((candidate) => candidate.publicId === flow.publicId);
  if (index >= 0) flows[index] = flow;
  else flows.unshift(flow);
  writeAll(flows);
}

function anonymousClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) return existing.toLowerCase();
  const created = crypto.randomUUID().replaceAll("-", "");
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

async function edge<T>(functionName: string, init: RequestInit = {}, query = ""): Promise<T> {
  const baseUrl = supabaseUrl();
  if (!baseUrl) throw new Error("Supabase is not configured");
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) headers.set("apikey", anonKey);
  const accessToken = await currentAccessToken();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (functionName === "create-flow" || functionName === "generate-sql") {
    headers.set("x-clavis-client-id", anonymousClientId());
  }
  const response = await fetch(`${baseUrl}/functions/v1/${functionName}${query}`, {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "処理APIの呼び出しに失敗しました。");
  return body as T;
}

export function listManagedFlows(): ManagedFlow[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function findManagedFlow(publicId: string): ManagedFlow | undefined {
  return readAll().find((flow) => flow.publicId === publicId);
}

export async function deleteManagedFlow(flow: ManagedFlow): Promise<void> {
  if (supabaseUrl()) {
    await edge("delete-flow", {
      method: "POST",
      headers: { "x-edit-token": flow.editToken },
      body: JSON.stringify({ publicId: flow.publicId }),
    });
  }
  writeAll(readAll().filter((candidate) => candidate.publicId !== flow.publicId));
}

export async function createManagedFlow(draft: FlowDraft, publish: boolean): Promise<ManagedFlow> {
  const now = new Date().toISOString();
  const visibility = normalizeFlowVisibility(draft.visibility);
  const preparedDraft = { ...draft, visibility };
  let publicId = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  let editToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

  if (supabaseUrl()) {
    const created = await edge<{ publicId: string; editToken: string; version: number }>("create-flow", {
      method: "POST",
      body: JSON.stringify(preparedDraft),
    });
    publicId = created.publicId;
    editToken = created.editToken;
    const savedDraft: ManagedFlow = { ...preparedDraft, publicId, editToken, status: "draft", version: created.version, createdAt: now, updatedAt: now };
    upsert(savedDraft);
    if (!publish) return savedDraft;
    try {
      await setRemotePublication(publicId, editToken, created.version, true, visibility);
    } catch (error) {
      throw publicationFailure(error, savedDraft);
    }
    const published: ManagedFlow = { ...savedDraft, status: "published", updatedAt: new Date().toISOString(), updatedBy: await currentUserDisplayName() };
    upsert(published);
    return published;
  }

  const flow: ManagedFlow = { ...preparedDraft, publicId, editToken, status: publish ? "published" : "draft", version: 1, createdAt: now, updatedAt: now, updatedBy: publish ? await currentUserDisplayName() : undefined };
  upsert(flow);
  return flow;
}

export async function updateManagedFlow(existing: ManagedFlow, draft: FlowDraft, publish: boolean): Promise<ManagedFlow> {
  const visibility = normalizeFlowVisibility(draft.visibility ?? existing.visibility);
  const preparedDraft = { ...draft, visibility };
  let version = existing.version + 1;
  if (supabaseUrl()) {
    const updated = await edge<{ version: number }>("update-flow", {
      method: "POST",
      headers: { "x-edit-token": existing.editToken },
      body: JSON.stringify({ publicId: existing.publicId, ...preparedDraft }),
    });
    version = updated.version;
    const savedChanges: ManagedFlow = { ...existing, ...preparedDraft, version, status: "unpublished", updatedAt: new Date().toISOString() };
    upsert(savedChanges);
    if (!publish) return savedChanges;
    try {
      await setRemotePublication(existing.publicId, existing.editToken, version, true, visibility);
    } catch (error) {
      throw publicationFailure(error, savedChanges);
    }
    const published: ManagedFlow = { ...savedChanges, status: "published", updatedAt: new Date().toISOString(), updatedBy: await currentUserDisplayName() };
    upsert(published);
    return published;
  }
  const flow: ManagedFlow = { ...existing, ...preparedDraft, version, status: publish ? "published" : "unpublished", updatedAt: new Date().toISOString(), updatedBy: publish ? await currentUserDisplayName() : existing.updatedBy };
  upsert(flow);
  return flow;
}

function publicationFailure(error: unknown, savedFlow: ManagedFlow) {
  const detail = error instanceof Error ? error.message : "公開処理に失敗しました。";
  return Object.assign(
    new Error(`処理定義は保存されましたが公開できませんでした。もう一度「変更を公開」を押すか、作成済み処理から再開してください。 ${detail}`, { cause: error }),
    { savedFlow },
  );
}

export function savedFlowFromPublicationError(error: unknown): ManagedFlow | undefined {
  if (!(error instanceof Error) || !("savedFlow" in error)) return undefined;
  return (error as Error & { savedFlow?: ManagedFlow }).savedFlow;
}

export async function setManagedFlowPublished(flow: ManagedFlow, publish: boolean): Promise<ManagedFlow> {
  const visibility = normalizeFlowVisibility(flow.visibility);
  if (supabaseUrl()) await setRemotePublication(flow.publicId, flow.editToken, flow.version, publish, visibility);
  const updated: ManagedFlow = { ...flow, visibility, status: publish ? "published" : "unpublished", updatedAt: new Date().toISOString(), updatedBy: publish ? await currentUserDisplayName() : flow.updatedBy };
  upsert(updated);
  return updated;
}

export async function uploadManagedFlowSamples(flow: ManagedFlow, samples: Record<string, File>): Promise<void> {
  if (!supabaseUrl()) throw new Error("サンプルの保存にはSupabase接続が必要です。");
  for (const [inputId, file] of Object.entries(samples)) {
    const form = new FormData();
    form.set("publicId", flow.publicId);
    form.set("version", String(flow.version));
    form.set("inputId", inputId);
    form.set("file", file);
    await edge("upload-flow-sample", {
      method: "POST",
      headers: { "x-edit-token": flow.editToken },
      body: form,
    });
  }
}

async function setRemotePublication(publicId: string, token: string, version: number, publish: boolean, visibility: FlowVisibility) {
  await edge(publish ? "publish-flow" : "unpublish-flow", {
    method: "POST",
    headers: { "x-edit-token": token },
    body: JSON.stringify({ publicId, version, visibility }),
  });
}

export type EditableManagedFlow = ManagedFlow & { editSamples?: FlowSample[] };

export async function loadEditableFlow(publicId: string, token?: string): Promise<EditableManagedFlow> {
  const local = findManagedFlow(publicId);
  const localMatches = Boolean(local && (!token || token === local.editToken));
  const effectiveToken = token ?? local?.editToken;
  if (!supabaseUrl() && localMatches) return local!;
  if (!effectiveToken) throw new Error("編集トークンがありません。編集用URLを確認してください。");
  const remote = await edge<{
    publicId: string; name: string; description: string; status: FlowStatus; version: number;
    visibility?: FlowVisibility; categories?: FlowDraft["categories"]; instruction?: string; aiSamples?: FlowDraft["aiSamples"]; inputs: FlowDraft["inputs"]; sql: string; output: FlowDraft["output"]; duckdbVersion: string; samples?: FlowSample[];
  }>("get-edit-flow", {
    method: "POST",
    headers: { "x-edit-token": effectiveToken },
    body: JSON.stringify({ publicId }),
  }).catch((error) => {
    if (localMatches) return undefined;
    throw error;
  });
  if (!remote) return local!;
  const { samples, ...definition } = remote;
  const now = new Date().toISOString();
  const managed: ManagedFlow = { ...definition, editToken: effectiveToken, createdAt: local?.createdAt ?? now, updatedAt: now };
  upsert(managed);
  return {
    ...managed,
    editSamples: samples?.map((sample) => ({ ...sample, url: normalizeSampleUrl(sample.url) })),
  };
}

export async function loadPublicFlow(publicId: string): Promise<PublicFlow> {
  const baseUrl = supabaseUrl();
  if (baseUrl) {
    try {
      return normalizePublicFlowSampleUrls(await edge<PublicFlow>("get-public-flow", { method: "GET" }, `?id=${encodeURIComponent(publicId)}`));
    } catch (error) {
      const local = localPublicFlow(publicId);
      if (local) return local;
      const bundled = getBundledDemo(publicId);
      if (bundled) return bundled;
      throw error;
    }
  }
  const local = localPublicFlow(publicId);
  if (local) return local;
  const bundled = getBundledDemo(publicId);
  if (bundled) return bundled;
  throw new Error("公開処理が見つかりません。");
}

export function normalizePublicFlowSampleUrls(flow: PublicFlow): PublicFlow {
  if (!flow.samples?.length) return flow;
  return {
    ...flow,
    samples: flow.samples.map((sample) => ({
      ...sample,
      url: normalizeSampleUrl(sample.url),
    })),
  };
}

function normalizeSampleUrl(url: string) {
  return url.replace(/^http:\/\/([^/]+\.supabase\.co)(?=\/)/i, "https://$1");
}

export async function loadPublicFlowCatalog(): Promise<PublicFlowSummary[]> {
  if (!supabaseUrl()) return [];
  const result = await edge<{ flows: PublicFlowSummary[] }>("list-public-flows", { method: "GET" });
  return result.flows;
}

export type GeneratedFlowSql = {
  sql: string;
  summary: string;
  warnings: string[];
  samples?: Record<string, AiSampleRow[]>;
};

export async function generateFlowSql(instruction: string, inputs: FlowDraft["inputs"]): Promise<GeneratedFlowSql> {
  if (!supabaseUrl()) throw new Error("AI生成を利用するにはSupabase Edge Functionsの接続設定が必要です。");
  const result = await edge<GeneratedFlowSql>("generate-sql", {
    method: "POST",
    body: JSON.stringify({
      instruction,
      inputs: inputs.map((input) => ({
        tableName: input.tableName,
        columns: input.requiredColumns.map((column) => ({ name: column.name, type: column.type })),
      })),
    }),
  });
  if (!result.sql?.trim() || typeof result.summary !== "string" || !Array.isArray(result.warnings)) {
    throw new Error("AI生成結果の形式が不正です。");
  }
  if (result.samples && (typeof result.samples !== "object" || Array.isArray(result.samples))) {
    result.samples = undefined;
  }
  return result;
}

function localPublicFlow(publicId: string): PublicFlow | undefined {
  const flow = findManagedFlow(publicId);
  if (!flow || flow.status !== "published") return undefined;
  return {
    publicId: flow.publicId,
    name: flow.name,
    description: flow.description,
    visibility: normalizeFlowVisibility(flow.visibility),
    categories: flow.categories ?? [],
    instruction: flow.instruction,
    version: flow.version,
    updatedAt: flow.updatedAt,
    updatedBy: flow.updatedBy,
    inputs: flow.inputs,
    sql: flow.sql,
    output: flow.output,
    duckdbVersion: flow.duckdbVersion,
  };
}

export function normalizeFlowVisibility(value: unknown): FlowVisibility {
  return value === "unlisted" ? "unlisted" : "public";
}

async function currentUserDisplayName() {
  const client = getSupabaseBrowserClient();
  if (!client) return;
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) return;
  const metadata = user.user_metadata as Record<string, unknown>;
  const value = [metadata.full_name, metadata.name].find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : user.email;
}

export function publicRunUrl(publicId: string) {
  return `/run/?flow=${encodeURIComponent(publicId)}`;
}

export function editUrl(flow: ManagedFlow) {
  return `/flows/edit/?flow=${encodeURIComponent(flow.publicId)}#token=${encodeURIComponent(flow.editToken)}`;
}
