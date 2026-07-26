"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronDown } from "lucide-react";
import { getBundledSampleFiles } from "@/lib/demo-flow";
import type { CsvEncoding, FileAnalysis, PublicFlow, QueryResult } from "@/lib/flow-types";
import { loadPublicFlow } from "@/lib/flow-store";
import { ProcessingClient } from "@/lib/processing-client";

type FileState = {
  name?: string;
  size?: number;
  encoding: CsvEncoding;
  analysis?: FileAnalysis;
  status: "empty" | "analyzing" | "ready" | "error";
  error?: string;
};
type PreviewResult = Omit<QueryResult, "csv">;
type SelectedFile = { tableName: string; file: File; encoding: CsvEncoding; delimiter: string };

const encodingLabels: Record<CsvEncoding, string> = {
  auto: "自動判定",
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 BOM",
  shift_jis: "Shift-JIS",
  cp932: "Windows-31J / CP932",
};

export function FlowRunner() {
  const [flow, setFlow] = useState<PublicFlow>();
  const [fileStates, setFileStates] = useState<Record<string, FileState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [dragTargetId, setDragTargetId] = useState<string>();
  const [result, setResult] = useState<PreviewResult>();
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const files = useRef<Record<string, File>>({});
  const client = useRef<ProcessingClient | null>(null);

  useEffect(() => {
    client.current = new ProcessingClient(setPhase);
    return () => client.current?.close();
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const publicId = new URL(window.location.href).searchParams.get("flow") ?? "";
      if (!publicId) {
        setError("公開IDがありません。共有された公開URLを確認してください。");
        setLoading(false);
        return;
      }
      try {
        const loaded = await loadPublicFlow(publicId);
        if (!active) return;
        initializeFlow(loaded);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "フローを取得できませんでした。");
      } finally {
        if (active) setLoading(false);
      }
    }
    function initializeFlow(loaded: PublicFlow) {
      if (!active) return;
      setFlow(loaded);
      setFileStates(Object.fromEntries(loaded.inputs.map((input) => [input.id, { encoding: "auto", status: "empty" }])));
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  function clearResult() {
    setResult(undefined);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(undefined);
    }
  }

  async function analyze(inputId: string, file: File, encoding: CsvEncoding) {
    if (!flow || !client.current) return;
    const definition = flow.inputs.find((input) => input.id === inputId);
    if (!definition) return;
    files.current[inputId] = file;
    clearResult();
    setError(undefined);
    setFileStates((current) => ({ ...current, [inputId]: { name: file.name, size: file.size, encoding, status: "analyzing" } }));
    try {
      const analysis = await client.current.analyze(file, encoding, definition.delimiter, definition.headerRow ?? 1);
      const missing = definition.requiredColumns.filter((column) => column.required && !analysis.headers.includes(column.name));
      const validationError = missing.length ? `必須列がありません: ${missing.map((column) => column.name).join("、")}` : undefined;
      setFileStates((current) => ({
        ...current,
        [inputId]: { name: file.name, size: file.size, encoding, analysis, status: validationError ? "error" : "ready", error: validationError },
      }));
    } catch (analysisError) {
      setFileStates((current) => ({
        ...current,
        [inputId]: { name: file.name, size: file.size, encoding, status: "error", error: analysisError instanceof Error ? analysisError.message : "解析に失敗しました。" },
      }));
    }
  }

  function changeEncoding(inputId: string, encoding: CsvEncoding) {
    const file = files.current[inputId];
    setFileStates((current) => ({ ...current, [inputId]: { ...current[inputId], encoding } }));
    if (file) void analyze(inputId, file, encoding);
  }

  function handleDragEnter(inputId: string, event: DragEvent<HTMLElement>) {
    if (running || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    setDragTargetId(inputId);
  }

  function handleDragLeave(inputId: string, event: DragEvent<HTMLElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragTargetId((current) => current === inputId ? undefined : current);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (running) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(inputId: string, encoding: CsvEncoding, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragTargetId(undefined);
    if (running) return;
    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length !== 1) {
      setError("CSVは入力カードごとに1ファイルずつドロップしてください。");
      return;
    }
    const file = droppedFiles[0];
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("CSV形式のファイルを選択してください。");
      return;
    }
    void analyze(inputId, file, encoding);
  }

  function selectedFiles(): SelectedFile[] {
    if (!flow) return [];
    return flow.inputs.map((input) => {
      const file = files.current[input.id];
      const state = fileStates[input.id];
      if (!file || state?.status !== "ready" || state.analysis?.warning) {
        throw new Error(`${input.label}のファイル、文字コード、必須列を確認してください。`);
      }
      return { tableName: input.tableName, file, encoding: state.encoding, delimiter: input.delimiter };
    });
  }

  async function execute(selected: SelectedFile[]) {
    if (!flow || !client.current) return;
    clearResult();
    setError(undefined);
    setRunning(true);
    setPhase("実行準備中");
    try {
      const completed = await client.current.run(flow, selected);
      const blob = new Blob([completed.csv.buffer as ArrayBuffer], { type: "text/csv;charset=utf-8" });
      setDownloadUrl(URL.createObjectURL(blob));
      const { csv: _csv, ...preview } = completed;
      void _csv;
      setResult(preview);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "実行に失敗しました。");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  async function runSelectedFiles() {
    try {
      await execute(selectedFiles());
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "CSVを確認してください。");
    }
  }

  async function runDemoSample() {
    if (!flow || !client.current) return;
    const sampleContents = getBundledSampleFiles(flow.publicId);
    if (!sampleContents) throw new Error("このフローにはサンプルデータがありません。");
    const sampleStates: Record<string, FileState> = {};
    const selected = await Promise.all(flow.inputs.map(async (input) => {
      const sample = sampleContents[input.tableName];
      if (!sample) throw new Error("このフローにはサンプルデータがありません。");
      const response = await fetch(sample.url);
      if (!response.ok) throw new Error(`${sample.name}を読み込めませんでした。`);
      const file = new File([await response.arrayBuffer()], sample.name, { type: "text/csv" });
      const analysis = await client.current!.analyze(file, "auto", input.delimiter, input.headerRow ?? 1);
      files.current[input.id] = file;
      sampleStates[input.id] = {
        name: file.name,
        size: file.size,
        encoding: "auto",
        status: analysis.warning ? "error" : "ready",
        analysis,
        error: analysis.warning,
      };
      return { tableName: input.tableName, file, encoding: "auto" as const, delimiter: input.delimiter };
    }));
    setFileStates(sampleStates);
    await execute(selected);
  }

  if (loading) {
    return <main className="tool-shell"><div className="loading-row"><span className="spinner" />フローを読み込んでいます</div></main>;
  }
  if (!flow) {
    return <main className="tool-shell"><div className="error-message">{error ?? "フローが見つかりません。"}</div></main>;
  }

  const canRun = flow.inputs.every((input) => fileStates[input.id]?.status === "ready" && !fileStates[input.id]?.analysis?.warning);
  const hasBundledSamples = Boolean(getBundledSampleFiles(flow.publicId));
  return (
    <main className="tool-shell">
      <header className="flow-header">
        <div className="flow-title-row">
          <h1>{flow.name}</h1>
        </div>
        <div className="flow-identity"><span>公開ID {flow.publicId}</span><span>バージョン {flow.version}</span></div>
        {flow.description && <p>{flow.description}</p>}
        <details className="flow-details">
          <summary>処理内容と必要な列を確認<ChevronDown className="flow-details-chevron" size={17} aria-hidden="true" /></summary>
          <div className="flow-details-body">
            {flow.inputs.map((input) => (
              <p key={input.id}><strong>{input.label}</strong>：{input.requiredColumns.filter((column) => column.required).map((column) => column.name).join("、")}</p>
            ))}
            <p><strong>結果</strong>：{flow.output.fileName}</p>
          </div>
        </details>
      </header>

      <section className="step-content runner-content">
          <div className="section-heading">
            <h2>CSVを選択</h2>
          </div>

          {hasBundledSamples && (
            <button className="runner-sample-link" disabled={running} onClick={() => void runDemoSample()}>サンプルで実行</button>
          )}

          <div className="runner-file-list">
            {flow.inputs.map((input) => {
              const state = fileStates[input.id] ?? { encoding: "auto" as const, status: "empty" as const };
              return (
                <article className="runner-file-block" key={input.id}>
                  <header className="runner-file-heading">
                    <h3>{input.label}</h3>
                    <div className="runner-encoding-control">
                      <label htmlFor={`encoding-${input.id}`}>文字コード</label>
                      <select id={`encoding-${input.id}`} value={state.encoding} onChange={(event) => changeEncoding(input.id, event.target.value as CsvEncoding)}>
                        {Object.entries(encodingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </header>
                  <div
                    className={`runner-file-dropzone${dragTargetId === input.id ? " drag-active" : ""}`}
                    onDragEnter={(event) => handleDragEnter(input.id, event)}
                    onDragLeave={(event) => handleDragLeave(input.id, event)}
                    onDragOver={handleDragOver}
                    onDrop={(event) => handleDrop(input.id, state.encoding, event)}
                  >
                    <strong>{dragTargetId === input.id ? "ここにドロップしてください" : "CSVをここにドロップ"}</strong>
                    <span>または</span>
                    <label className="button secondary runner-file-button">
                      <input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void analyze(input.id, file, state.encoding); }} />
                      ファイルを選択
                    </label>
                  </div>
                  <div className="runner-file-status" aria-live="polite">
                    {state.status === "analyzing" && <span><span className="spinner small" />{state.name}を解析中</span>}
                    {state.status === "ready" && state.analysis && <span className="success-text">{state.name}　確認済み・判定：{encodingLabels[state.analysis.detectedEncoding]}</span>}
                    {(state.error || state.analysis?.warning) && <span className="warning-text">{state.error ?? state.analysis?.warning}</span>}
                  </div>
                </article>
              );
            })}
          </div>

          {error && <div className="error-message">{error}</div>}
          {running && <div className="processing-status"><span className="spinner" /><strong>{phase || "処理中"}</strong><button className="text-button danger" onClick={() => client.current?.cancel()}>キャンセル</button></div>}
          <div className="step-actions end">
            <button className="button primary" disabled={!canRun || running} onClick={() => void runSelectedFiles()}>{running ? "実行しています..." : "実行する"}</button>
          </div>

        {result && (
          <div className="runner-result" aria-live="polite">
          <div className="result-toolbar">
            <div><h2>処理結果</h2><p>{result.totalRows.toLocaleString()}件を処理しました（{result.elapsedMs.toLocaleString()}ms）</p></div>
            {downloadUrl && <a className="button primary" href={downloadUrl} download={flow.output.fileName}>結果CSVをダウンロード</a>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map((column) => <td key={column}>{row[column] == null ? "—" : String(row[column])}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {result.totalRows > 100 && <p className="table-note">画面は先頭100件のみ表示しています。ダウンロードファイルには全件が含まれます。</p>}
          <div className="step-actions start"><button className="button plain" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>別のCSVを選択</button></div>
          </div>
        )}
      </section>
    </main>
  );
}
