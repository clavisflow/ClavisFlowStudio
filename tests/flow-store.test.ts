import assert from "node:assert/strict";
import test from "node:test";
import type { FlowDraft, ManagedFlow } from "../lib/flow-types.ts";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const draft: FlowDraft = {
  name: "公開失敗確認",
  description: "",
  instruction: "一覧にして。",
  inputs: [{ id: "input-1", label: "入力", tableName: "input_1", encoding: "utf-8", delimiter: ",", requiredColumns: [{ name: "id", type: "VARCHAR", required: true }] }],
  sql: "SELECT * FROM input_1",
  output: { fileName: "result.csv", encoding: "utf-8-bom", enabled: false },
  duckdbVersion: "1.32.0",
};

test("a remotely saved draft remains editable when initial publication fails", async () => {
  const globals = globalThis as typeof globalThis & { window: Window; localStorage: Storage };
  const originalWindow = globals.window;
  const originalStorage = globals.localStorage;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storage = new MemoryStorage();
  Object.defineProperty(globals, "window", { configurable: true, value: globals });
  Object.defineProperty(globals, "localStorage", { configurable: true, value: storage });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let request = 0;
  const clientIds: string[] = [];
  globalThis.fetch = async (_input, init) => {
    request += 1;
    clientIds.push(new Headers(init?.headers).get("x-clavis-client-id") ?? "");
    if (request === 1) return Response.json({ publicId: "saved-draft-123", editToken: "secret-token", version: 1 }, { status: 201 });
    return Response.json({ error: "公開サービスが一時的に利用できません。" }, { status: 500 });
  };

  try {
    const { createManagedFlow, listManagedFlows, savedFlowFromPublicationError } = await import("../lib/flow-store.ts");
    await assert.rejects(() => createManagedFlow(draft, true), (error: unknown) => {
      assert.equal(savedFlowFromPublicationError(error)?.publicId, "saved-draft-123");
      return true;
    });
    const saved = listManagedFlows();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].publicId, "saved-draft-123");
    assert.equal(saved[0].editToken, "secret-token");
    assert.equal(saved[0].status, "draft");
    assert.equal(saved[0].output.enabled, false);
    assert.match(clientIds[0], /^[a-f0-9]{32}$/);
    assert.deepEqual(clientIds, [clientIds[0], ""]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalWindow === undefined) delete (globals as Partial<typeof globals>).window;
    else Object.defineProperty(globals, "window", { configurable: true, value: originalWindow });
    if (originalStorage === undefined) delete (globals as Partial<typeof globals>).localStorage;
    else Object.defineProperty(globals, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("an unpublished update remains editable when publishing its new version fails", async () => {
  const globals = globalThis as typeof globalThis & { window: Window; localStorage: Storage };
  const originalWindow = globals.window;
  const originalStorage = globals.localStorage;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storage = new MemoryStorage();
  Object.defineProperty(globals, "window", { configurable: true, value: globals });
  Object.defineProperty(globals, "localStorage", { configurable: true, value: storage });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let request = 0;
  globalThis.fetch = async () => {
    request += 1;
    if (request === 1) return Response.json({ version: 2 });
    return Response.json({ error: "公開サービスが一時的に利用できません。" }, { status: 500 });
  };

  const existing: ManagedFlow = { ...draft, publicId: "published-flow-123", editToken: "secret-token", status: "published", version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  try {
    const { listManagedFlows, savedFlowFromPublicationError, updateManagedFlow } = await import("../lib/flow-store.ts");
    await assert.rejects(() => updateManagedFlow(existing, { ...draft, name: "更新版" }, true), (error: unknown) => {
      const saved = savedFlowFromPublicationError(error);
      assert.equal(saved?.version, 2);
      assert.equal(saved?.status, "unpublished");
      return true;
    });
    const saved = listManagedFlows();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].version, 2);
    assert.equal(saved[0].name, "更新版");
    assert.equal(saved[0].status, "unpublished");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalWindow === undefined) delete (globals as Partial<typeof globals>).window;
    else Object.defineProperty(globals, "window", { configurable: true, value: originalWindow });
    if (originalStorage === undefined) delete (globals as Partial<typeof globals>).localStorage;
    else Object.defineProperty(globals, "localStorage", { configurable: true, value: originalStorage });
  }
});
