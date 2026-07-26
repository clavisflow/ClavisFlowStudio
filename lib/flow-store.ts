import { getBundledDemo } from "./demo-flow";
import type { FlowDraft, FlowStatus, ManagedFlow, PublicFlow } from "./flow-types";

const STORAGE_KEY = "clavisflow-studio:managed-flows:v1";

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

async function edge<T>(functionName: string, init: RequestInit = {}, query = ""): Promise<T> {
  const baseUrl = supabaseUrl();
  if (!baseUrl) throw new Error("Supabase is not configured");
  const response = await fetch(`${baseUrl}/functions/v1/${functionName}${query}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "フローAPIの呼び出しに失敗しました。");
  return body as T;
}

export function listManagedFlows(): ManagedFlow[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function findManagedFlow(publicId: string): ManagedFlow | undefined {
  return readAll().find((flow) => flow.publicId === publicId);
}

export async function createManagedFlow(draft: FlowDraft, publish: boolean): Promise<ManagedFlow> {
  const now = new Date().toISOString();
  let publicId = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  let editToken = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");

  if (supabaseUrl()) {
    const created = await edge<{ publicId: string; editToken: string; version: number }>("create-flow", {
      method: "POST",
      body: JSON.stringify(draft),
    });
    publicId = created.publicId;
    editToken = created.editToken;
    if (publish) await setRemotePublication(publicId, editToken, 1, true);
  }

  const flow: ManagedFlow = { ...draft, publicId, editToken, status: publish ? "published" : "draft", version: 1, createdAt: now, updatedAt: now };
  upsert(flow);
  return flow;
}

export async function updateManagedFlow(existing: ManagedFlow, draft: FlowDraft, publish: boolean): Promise<ManagedFlow> {
  let version = existing.version + 1;
  if (supabaseUrl()) {
    const updated = await edge<{ version: number }>("update-flow", {
      method: "POST",
      headers: { "x-edit-token": existing.editToken },
      body: JSON.stringify({ publicId: existing.publicId, ...draft }),
    });
    version = updated.version;
    await setRemotePublication(existing.publicId, existing.editToken, version, publish);
  }
  const flow: ManagedFlow = { ...existing, ...draft, version, status: publish ? "published" : "unpublished", updatedAt: new Date().toISOString() };
  upsert(flow);
  return flow;
}

export async function setManagedFlowPublished(flow: ManagedFlow, publish: boolean): Promise<ManagedFlow> {
  if (supabaseUrl()) await setRemotePublication(flow.publicId, flow.editToken, flow.version, publish);
  const updated: ManagedFlow = { ...flow, status: publish ? "published" : "unpublished", updatedAt: new Date().toISOString() };
  upsert(updated);
  return updated;
}

async function setRemotePublication(publicId: string, token: string, version: number, publish: boolean) {
  await edge(publish ? "publish-flow" : "unpublish-flow", {
    method: "POST",
    headers: { "x-edit-token": token },
    body: JSON.stringify({ publicId, version }),
  });
}

export async function loadEditableFlow(publicId: string, token?: string): Promise<ManagedFlow> {
  const local = findManagedFlow(publicId);
  if (local && (!token || token === local.editToken)) return local;
  if (!token) throw new Error("編集トークンがありません。編集用URLを確認してください。");
  const remote = await edge<{
    publicId: string; name: string; description: string; status: FlowStatus; version: number;
    inputs: FlowDraft["inputs"]; sql: string; output: FlowDraft["output"]; duckdbVersion: string;
  }>("get-edit-flow", {
    method: "POST",
    headers: { "x-edit-token": token },
    body: JSON.stringify({ publicId }),
  });
  const now = new Date().toISOString();
  const managed: ManagedFlow = { ...remote, editToken: token, createdAt: now, updatedAt: now };
  upsert(managed);
  return managed;
}

export async function loadPublicFlow(publicId: string): Promise<PublicFlow> {
  const baseUrl = supabaseUrl();
  if (baseUrl) {
    try {
      return await edge<PublicFlow>("get-public-flow", { method: "GET" }, `?id=${encodeURIComponent(publicId)}`);
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
  throw new Error("公開フローが見つかりません。");
}

export async function generateFlowSql(instruction: string, inputs: FlowDraft["inputs"]): Promise<string> {
  if (!supabaseUrl()) throw new Error("AI生成を利用するにはSupabase Edge Functionsの接続設定が必要です。");
  const result = await edge<{ sql: string }>("generate-sql", {
    method: "POST",
    body: JSON.stringify({
      instruction,
      inputs: inputs.map((input) => ({
        tableName: input.tableName,
        columns: input.requiredColumns.map((column) => ({ name: column.name, type: column.type })),
      })),
    }),
  });
  return result.sql;
}

function localPublicFlow(publicId: string): PublicFlow | undefined {
  const flow = findManagedFlow(publicId);
  if (!flow || flow.status !== "published") return undefined;
  return {
    publicId: flow.publicId,
    name: flow.name,
    description: flow.description,
    version: flow.version,
    inputs: flow.inputs,
    sql: flow.sql,
    output: flow.output,
    duckdbVersion: flow.duckdbVersion,
  };
}

export function publicRunUrl(publicId: string) {
  return `/run/?flow=${encodeURIComponent(publicId)}`;
}

export function editUrl(flow: ManagedFlow) {
  return `/flows/edit/?flow=${encodeURIComponent(flow.publicId)}#token=${encodeURIComponent(flow.editToken)}`;
}
