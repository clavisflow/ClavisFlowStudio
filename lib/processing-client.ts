import type { CsvEncoding, FileAnalysis, PublicFlow, QueryResult } from "./flow-types";

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class ProcessingClient {
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private onProgress?: (phase: string) => void;

  constructor(onProgress?: (phase: string) => void) { this.onProgress = onProgress; }

  analyze(file: File, encoding: CsvEncoding, delimiter: string, headerRow = 1): Promise<FileAnalysis> {
    return this.request("analyze", { bytes: file.arrayBuffer(), encoding, delimiter, headerRow }, 15_000) as Promise<FileAnalysis>;
  }

  run(flow: PublicFlow, files: Array<{ tableName: string; file: File; encoding: CsvEncoding; delimiter: string }>): Promise<QueryResult> {
    const prepared = Promise.all(files.map(async (item) => ({ ...item, bytes: await item.file.arrayBuffer(), file: undefined })));
    return this.request("run", { flow, files: prepared }, 60_000) as Promise<QueryResult>;
  }

  cancel() {
    this.dispose(new Error("処理をキャンセルしました。"));
  }

  close() { this.dispose(new Error("処理画面を閉じました。")); }

  private ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("../workers/processing.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<{ id: string; type: string; result?: unknown; error?: string; phase?: string }>) => {
      const message = event.data;
      if (message.type === "progress") { this.onProgress?.(message.phase ?? "処理中"); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.type === "error") pending.reject(new Error(message.error ?? "処理に失敗しました。"));
      else pending.resolve(message.result);
    };
    this.worker.onerror = () => this.dispose(new Error("処理Workerでエラーが発生しました。"));
  }

  private async request(type: "analyze" | "run", raw: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    this.ensureWorker();
    const id = crypto.randomUUID();
    const message: Record<string, unknown> = { id, type };
    const transfers: Transferable[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (value instanceof Promise) message[key] = await value;
      else if (Array.isArray(value) && value.length && "bytes" in value[0] && value[0].bytes instanceof Promise) message[key] = await Promise.all(value.map(async (item) => ({ ...item, bytes: await item.bytes })));
      else message[key] = value;
    }
    if (message.bytes instanceof ArrayBuffer) transfers.push(message.bytes);
    if (Array.isArray(message.files)) for (const item of message.files) if (item.bytes instanceof ArrayBuffer) transfers.push(item.bytes);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.dispose(new Error(`処理が${timeoutMs / 1000}秒でタイムアウトしました。`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker?.postMessage(message, transfers);
    });
  }

  private dispose(error: Error) {
    this.worker?.terminate(); this.worker = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
