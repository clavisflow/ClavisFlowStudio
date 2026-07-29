"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDashed,
  CloudUpload,
  Columns3,
  CopyPlus,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Info,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  Sheet,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { inferColumnMatches, type ColumnMatch } from "@/lib/column-matching";
import { getBundledSampleFiles } from "@/lib/demo-flow";
import type { CsvEncoding, FileAnalysis, FlowInput, PublicFlow, QueryResult } from "@/lib/flow-types";
import { loadPublicFlow } from "@/lib/flow-store";
import { ProcessingClient } from "@/lib/processing-client";
import { ResultTable } from "@/components/result-table";
import { recordSuccessfulRun } from "@/lib/portal-activity";
import { applyA1Range, jsonTargets, rowsToCsv, type TabularRows } from "@/lib/tabular-data";

type DataSourceKind = "file" | "google";
type FileKind = "csv" | "excel" | "json" | "google";
type PreviewResult = Omit<QueryResult, "csv">;
type SelectedFile = {
  tableName: string;
  file: File;
  encoding: CsvEncoding;
  delimiter: string;
  headerRow: number;
  columnMapping: Record<string, string>;
};
type SourceCollection = {
  kind: "excel" | "json" | "google";
  entries: Array<{ name: string; rows: TabularRows }>;
};
type InputState = {
  sourceKind?: DataSourceKind;
  fileKind?: FileKind;
  name?: string;
  size?: number;
  encoding: CsvEncoding;
  analysis?: FileAnalysis;
  mappings?: Record<string, ColumnMatch>;
  status: "empty" | "analyzing" | "ready" | "error";
  error?: string;
  options?: string[];
  selectedOption?: string;
};
type GoogleForm = {
  url: string;
  sheet: string;
  range: string;
  sheets: string[];
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

const encodingLabels: Record<CsvEncoding, string> = {
  auto: "自動判定",
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 BOM",
  shift_jis: "Shift-JIS",
  cp932: "Windows-31J / CP932",
};

const typeLabels = {
  VARCHAR: "文字列",
  BIGINT: "整数",
  DOUBLE: "数値",
  DATE: "日付",
  BOOLEAN: "真偽値",
} as const;

export function FlowRunner() {
  const [flow, setFlow] = useState<PublicFlow>();
  const [inputStates, setInputStates] = useState<Record<string, InputState>>({});
  const [googleForms, setGoogleForms] = useState<Record<string, GoogleForm>>({});
  const [sourceTab, setSourceTab] = useState<DataSourceKind>("file");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [dragTargetId, setDragTargetId] = useState<string>();
  const [result, setResult] = useState<PreviewResult>();
  const [executionStatus, setExecutionStatus] = useState<"idle" | "success" | "failure">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const [notice, setNotice] = useState("");
  const preparedFiles = useRef<Record<string, File>>({});
  const sourceCollections = useRef<Record<string, SourceCollection>>({});
  const client = useRef<ProcessingClient | null>(null);
  const dataSectionRef = useRef<HTMLElement>(null);

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
        setFlow(loaded);
        setInputStates(Object.fromEntries(loaded.inputs.map((input) => [input.id, emptyInputState()])));
        setGoogleForms(Object.fromEntries(loaded.inputs.map((input) => [input.id, emptyGoogleForm()])));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "処理を取得できませんでした。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  function clearResult() {
    setResult(undefined);
    setExecutionStatus("idle");
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(undefined);
    }
  }

  async function analyzePrepared(
    input: FlowInput,
    file: File,
    meta: Pick<InputState, "sourceKind" | "fileKind" | "name" | "size" | "options" | "selectedOption">,
    encoding: CsvEncoding,
  ) {
    if (!client.current) return;
    preparedFiles.current[input.id] = file;
    clearResult();
    setError(undefined);
    setInputStates((current) => ({
      ...current,
      [input.id]: { ...current[input.id], ...meta, encoding, status: "analyzing", error: undefined, analysis: undefined, mappings: undefined },
    }));
    try {
      const headerRow = meta.fileKind === "csv" ? input.headerRow ?? 1 : 1;
      const analysis = await client.current.analyze(file, encoding, input.delimiter, headerRow);
      const mappings = inferColumnMatches(input.requiredColumns, analysis);
      setInputStates((current) => ({
        ...current,
        [input.id]: {
          ...current[input.id],
          ...meta,
          encoding,
          analysis,
          mappings,
          status: analysis.warning ? "error" : "ready",
          error: analysis.warning,
        },
      }));
    } catch (analysisError) {
      setInputStates((current) => ({
        ...current,
        [input.id]: {
          ...current[input.id],
          ...meta,
          encoding,
          status: "error",
          error: analysisError instanceof Error ? analysisError.message : "データの解析に失敗しました。",
        },
      }));
    }
  }

  async function chooseFile(input: FlowInput, file: File) {
    const extension = file.name.split(".").pop()?.toLocaleLowerCase();
    if (!["csv", "xlsx", "json"].includes(extension ?? "")) {
      setError("CSV、Excel（.xlsx）、JSONのいずれかを選択してください。");
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      setError("ファイルは250MB以下にしてください。");
      return;
    }
    try {
      if (extension === "csv") {
        delete sourceCollections.current[input.id];
        await analyzePrepared(input, file, { sourceKind: "file", fileKind: "csv", name: file.name, size: file.size }, inputStates[input.id]?.encoding ?? "auto");
        return;
      }
      if (extension === "xlsx") {
        const { default: readExcelFile } = await import("read-excel-file/browser");
        const sheets = await readExcelFile(file);
        const collection: SourceCollection = {
          kind: "excel",
          entries: sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data as TabularRows })),
        };
        sourceCollections.current[input.id] = collection;
        await selectStructuredSource(input, collection.entries[0]?.name ?? "", file.name, file.size, "excel");
        return;
      }
      const parsed = JSON.parse(await file.text()) as unknown;
      const targets = jsonTargets(parsed);
      if (!targets.length) throw new Error("表として読み込めるオブジェクト配列がJSON内にありません。");
      const collection: SourceCollection = {
        kind: "json",
        entries: targets.map((target) => ({ name: target.path, rows: target.rows })),
      };
      sourceCollections.current[input.id] = collection;
      await selectStructuredSource(input, collection.entries[0].name, file.name, file.size, "json");
    } catch (fileError) {
      setInputStates((current) => ({
        ...current,
        [input.id]: {
          ...current[input.id],
          sourceKind: "file",
          fileKind: extension === "xlsx" ? "excel" : "json",
          name: file.name,
          size: file.size,
          status: "error",
          error: fileError instanceof Error ? fileError.message : "ファイルを読み込めませんでした。",
        },
      }));
    }
  }

  async function selectStructuredSource(input: FlowInput, option: string, originalName: string, size: number, kind: "excel" | "json") {
    const collection = sourceCollections.current[input.id];
    const entry = collection?.entries.find((candidate) => candidate.name === option);
    if (!collection || !entry) return;
    const csvFile = csvFileFromRows(entry.rows, `${originalName}-${entry.name}.csv`);
    await analyzePrepared(input, csvFile, {
      sourceKind: "file",
      fileKind: kind,
      name: originalName,
      size,
      options: collection.entries.map((candidate) => candidate.name),
      selectedOption: entry.name,
    }, "utf-8");
  }

  async function loadGoogleSheet(input: FlowInput) {
    const form = googleForms[input.id] ?? emptyGoogleForm();
    setGoogleForms((current) => ({ ...current, [input.id]: { ...form, status: "loading", error: undefined } }));
    setError(undefined);
    try {
      const response = await fetch("/api/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.url }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "スプレッドシートを読み込めませんでした。");
      }
      const workbook = new File([await response.blob()], "google-spreadsheet.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const sheets = await readExcelFile(workbook);
      const collection: SourceCollection = {
        kind: "google",
        entries: sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data as TabularRows })),
      };
      sourceCollections.current[input.id] = collection;
      const selectedSheet = collection.entries.some((entry) => entry.name === form.sheet) ? form.sheet : collection.entries[0]?.name ?? "";
      setGoogleForms((current) => ({
        ...current,
        [input.id]: { ...form, sheet: selectedSheet, sheets: collection.entries.map((entry) => entry.name), status: "ready" },
      }));
      await prepareGoogleSheet(input, selectedSheet, form.range);
    } catch (googleError) {
      const message = googleError instanceof Error ? googleError.message : "スプレッドシートを読み込めませんでした。";
      setGoogleForms((current) => ({ ...current, [input.id]: { ...form, status: "error", error: message } }));
      setInputStates((current) => ({ ...current, [input.id]: { ...current[input.id], sourceKind: "google", fileKind: "google", status: "error", error: message } }));
    }
  }

  async function prepareGoogleSheet(input: FlowInput, sheetName: string, range: string) {
    const collection = sourceCollections.current[input.id];
    const entry = collection?.entries.find((candidate) => candidate.name === sheetName);
    if (!entry) return;
    try {
      const rangedRows = applyA1Range(entry.rows, range);
      const csvFile = csvFileFromRows(rangedRows, `${sheetName}.csv`);
      await analyzePrepared(input, csvFile, {
        sourceKind: "google",
        fileKind: "google",
        name: `Googleスプレッドシート・${sheetName}`,
        size: csvFile.size,
        options: collection.entries.map((candidate) => candidate.name),
        selectedOption: sheetName,
      }, "utf-8");
    } catch (rangeError) {
      const message = rangeError instanceof Error ? rangeError.message : "範囲を読み込めませんでした。";
      setInputStates((current) => ({ ...current, [input.id]: { ...current[input.id], sourceKind: "google", status: "error", error: message } }));
    }
  }

  function changeEncoding(input: FlowInput, encoding: CsvEncoding) {
    const file = preparedFiles.current[input.id];
    const state = inputStates[input.id];
    setInputStates((current) => ({ ...current, [input.id]: { ...current[input.id], encoding } }));
    if (file && state?.fileKind === "csv") void analyzePrepared(input, file, state, encoding);
  }

  function changeMapping(inputId: string, requiredName: string, source: string) {
    clearResult();
    setInputStates((current) => {
      const state = current[inputId];
      return {
        ...current,
        [inputId]: {
          ...state,
          mappings: {
            ...state.mappings,
            [requiredName]: source
              ? { source, score: source === requiredName ? 1 : 0.75, status: source === requiredName ? "automatic" : "review" }
              : { score: 0, status: "unmapped" },
          },
        },
      };
    });
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

  function handleDrop(input: FlowInput, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragTargetId(undefined);
    if (running) return;
    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length !== 1) {
      setError("データソースごとに1ファイルずつドロップしてください。");
      return;
    }
    void chooseFile(input, droppedFiles[0]);
  }

  function selectedFiles(): SelectedFile[] {
    if (!flow) return [];
    return flow.inputs.map((input) => {
      const file = preparedFiles.current[input.id];
      const state = inputStates[input.id];
      const columnMapping = Object.fromEntries(input.requiredColumns.map((column) => [column.name, state?.mappings?.[column.name]?.source ?? ""]));
      if (!file || state?.status !== "ready" || state.sourceKind !== sourceTab || Object.values(columnMapping).some((value) => !value)) {
        throw new Error(`${input.label}のデータと列の対応を確認してください。`);
      }
      return {
        tableName: input.tableName,
        file,
        encoding: state.encoding,
        delimiter: input.delimiter,
        headerRow: state.fileKind === "csv" ? input.headerRow ?? 1 : 1,
        columnMapping,
      };
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
      const blob = new Blob([completed.csv.buffer as ArrayBuffer], { type: "text/csv" });
      setDownloadUrl(URL.createObjectURL(blob));
      const { csv: _csv, ...preview } = completed;
      void _csv;
      setResult(preview);
      setExecutionStatus("success");
      recordSuccessfulRun(flow.publicId);
      requestAnimationFrame(() => document.querySelector("#run-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (runError) {
      setExecutionStatus("failure");
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
      setError(selectionError instanceof Error ? selectionError.message : "データと列の対応を確認してください。");
    }
  }

  async function runDemoSample() {
    if (!flow || !client.current) return;
    try {
      const sampleContents = getBundledSampleFiles(flow.publicId);
      const sampleStates: Record<string, InputState> = {};
      const selected = await Promise.all(flow.inputs.map(async (input) => {
        const sample = sampleContents?.[input.tableName] ?? flow.samples?.find((candidate) => candidate.inputId === input.id);
        if (!sample) throw new Error("この処理にはサンプルデータがありません。");
        const fileName = "name" in sample ? sample.name : sample.fileName;
        const response = await fetch(sample.url);
        if (!response.ok) throw new Error(`${fileName}を読み込めませんでした。`);
        const file = new File([await response.arrayBuffer()], fileName, { type: response.headers.get("content-type") ?? "" });
        const prepared = await prepareQuickSample(input, file);
        sampleStates[input.id] = prepared.state;
        preparedFiles.current[input.id] = prepared.selected.file;
        return prepared.selected;
      }));
      setSourceTab("file");
      setInputStates(sampleStates);
      await execute(selected);
    } catch (sampleError) {
      setExecutionStatus("failure");
      setError(sampleError instanceof Error ? sampleError.message : "サンプルを実行できませんでした。");
    }
  }

  async function prepareQuickSample(input: FlowInput, sourceFile: File): Promise<{ state: InputState; selected: SelectedFile }> {
    if (!client.current) throw new Error("データ処理を準備できませんでした。");
    const extension = sourceFile.name.split(".").pop()?.toLowerCase();
    let preparedFile = sourceFile;
    let fileKind: FileKind = "csv";
    let options: string[] | undefined;
    let selectedOption: string | undefined;
    let encoding: CsvEncoding = "auto";
    let headerRow = input.headerRow ?? 1;

    if (extension === "xlsx") {
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const sheets = await readExcelFile(sourceFile);
      const first = sheets[0];
      if (!first) throw new Error(`${sourceFile.name}に読み込めるシートがありません。`);
      options = sheets.map((sheet) => sheet.sheet);
      selectedOption = first.sheet;
      preparedFile = csvFileFromRows(first.data as TabularRows, `${first.sheet}.csv`);
      fileKind = "excel";
      encoding = "utf-8";
      headerRow = 1;
    } else if (extension === "json") {
      const targets = jsonTargets(JSON.parse(await sourceFile.text()) as unknown);
      const first = targets[0];
      if (!first) throw new Error(`${sourceFile.name}に表として読み込めるデータがありません。`);
      options = targets.map((target) => target.path);
      selectedOption = first.path;
      preparedFile = csvFileFromRows(first.rows, "sample.json.csv");
      fileKind = "json";
      encoding = "utf-8";
      headerRow = 1;
    } else if (extension !== "csv") {
      throw new Error("サンプルはCSV、Excel（.xlsx）、JSONに対応しています。");
    }

    const analysis = await client.current.analyze(preparedFile, encoding, input.delimiter, headerRow);
    const mappings = inferColumnMatches(input.requiredColumns, analysis);
    if (input.requiredColumns.some((column) => !mappings[column.name]?.source)) {
      throw new Error(`${input.label}のサンプルで必要な列を対応できませんでした。`);
    }
    return {
      state: {
        sourceKind: "file",
        fileKind,
        name: sourceFile.name,
        size: sourceFile.size,
        encoding,
        status: analysis.warning ? "error" : "ready",
        analysis,
        mappings,
        options,
        selectedOption,
        error: analysis.warning,
      },
      selected: {
        tableName: input.tableName,
        file: preparedFile,
        encoding,
        delimiter: input.delimiter,
        headerRow,
        columnMapping: Object.fromEntries(input.requiredColumns.map((column) => [column.name, mappings[column.name].source!])),
      },
    };
  }

  async function saveExcel() {
    if (!flow || !result) return;
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const rows = [
      result.columns,
      ...result.rows.map((row) => result.columns.map((column) => row[column])),
    ];
    await writeExcelFile(rows).toFile(withExtension(flow.output.fileName, ".xlsx"));
  }

  function saveJson() {
    if (!flow || !result) return;
    downloadBlob(new Blob([JSON.stringify(result.rows, null, 2)], { type: "application/json" }), withExtension(flow.output.fileName, ".json"));
  }

  async function outputToGoogleSheets() {
    if (!result) return;
    const target = window.open("https://sheets.new", "_blank", "noopener,noreferrer");
    const tsv = [
      result.columns.join("\t"),
      ...result.rows.map((row) => result.columns.map((column) => String(row[column] ?? "").replaceAll("\t", " ")).join("\t")),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setNotice("結果をコピーしました。開いたスプレッドシートのA1セルへ貼り付けてください。");
    } catch {
      downloadBlob(new Blob([tsv], { type: "text/tab-separated-values" }), "処理結果.tsv");
      setNotice("貼り付け用ファイルを保存しました。Googleスプレッドシートで読み込んでください。");
    }
    if (!target) setNotice("結果をコピーしました。Googleスプレッドシートを開いて貼り付けてください。");
    window.setTimeout(() => setNotice(""), 4200);
  }

  if (loading) {
    return <main className="tool-shell"><div className="loading-row"><span className="spinner" />処理を読み込んでいます</div></main>;
  }
  if (!flow) {
    return <main className="tool-shell"><div className="error-message">{error ?? "処理が見つかりません。"}</div></main>;
  }

  const hasBundledSamples = Boolean(getBundledSampleFiles(flow.publicId)) ||
    Boolean(flow.samples?.length === flow.inputs.length && flow.inputs.every((input) => flow.samples?.some((sample) => sample.inputId === input.id)));
  const canRun = flow.inputs.every((input) => {
    const state = inputStates[input.id];
    return state?.status === "ready" &&
      state.sourceKind === sourceTab &&
      input.requiredColumns.every((column) => Boolean(state.mappings?.[column.name]?.source));
  });
  const inputRowCount = flow.inputs.reduce((total, input) => total + (inputStates[input.id]?.analysis?.rowCount ?? 0), 0);

  return (
    <main className="tool-shell runner-shell">
      <header className="runner-hero">
        <div>
          <p className="runner-eyebrow">公開処理</p>
          <h1>{flow.name}</h1>
          {flow.description && <p className="runner-description">{flow.description}</p>}
        </div>
        <div className="runner-hero-side">
          <dl className="runner-title-meta">
            <div><dt>公開ID</dt><dd>{flow.publicId}</dd></div>
            <div><dt>バージョン</dt><dd>{flow.version}</dd></div>
            <div><dt>更新日</dt><dd>{formatUpdatedAt(flow.updatedAt)}</dd></div>
            <div><dt>更新者</dt><dd>{flow.updatedBy ?? "追加予定"}</dd></div>
          </dl>
          <div className="runner-hero-actions">
            {hasBundledSamples && (
              <button className="runner-sample-button" disabled={running} onClick={() => void runDemoSample()}>
                <Play size={17} aria-hidden="true" />サンプルですぐ実行
              </button>
            )}
            <a className="runner-copy-button" href={`/flows/new/?copy=${encodeURIComponent(flow.publicId)}`}>
              <CopyPlus size={17} aria-hidden="true" />コピーして処理を作る
            </a>
          </div>
        </div>
      </header>

      <nav className="runner-step-nav" aria-label="実行手順">
        <a href="#data-source"><span>1</span>データを選択</a>
        <a href="#column-mapping"><span>2</span>列の対応を確認</a>
        <a href="#run-result"><span>3</span>実行結果</a>
      </nav>

      <section className="runner-section runner-data-section" id="data-source" ref={dataSectionRef} aria-labelledby="data-source-title">
        <div className="runner-section-heading">
          <div><span className="runner-step-number">1</span><div><h2 id="data-source-title">データを選択</h2><p>この処理に使用するデータソースを選択してください。</p></div></div>
        </div>

        <div className="runner-source-tabs" role="tablist" aria-label="データソース">
          <button role="tab" aria-selected={sourceTab === "file"} className={sourceTab === "file" ? "active" : ""} onClick={() => setSourceTab("file")}>
            <FileText size={19} aria-hidden="true" />ファイル
          </button>
          <button role="tab" aria-selected={sourceTab === "google"} className={sourceTab === "google" ? "active" : ""} onClick={() => setSourceTab("google")}>
            <Sheet size={19} aria-hidden="true" />Googleスプレッドシート
          </button>
        </div>

        <div className="runner-input-list">
          {flow.inputs.map((input) => {
            const state = inputStates[input.id] ?? emptyInputState();
            const google = googleForms[input.id] ?? emptyGoogleForm();
            return (
              <article className="runner-input-card" key={input.id}>
                <header>
                  <div>
                    <p className="runner-source-label">データソース</p>
                    <h3>{input.label}</h3>
                  </div>
                  <div className="runner-required-summary">
                    <span>必要な項目</span>
                    <div>{input.requiredColumns.map((column) => <b key={column.name}>{column.name}</b>)}</div>
                  </div>
                </header>

                {sourceTab === "file" ? (
                  <div role="tabpanel" className="runner-source-panel">
                    <div
                      className={`runner-file-dropzone${dragTargetId === input.id ? " drag-active" : ""}`}
                      onDragEnter={(event) => handleDragEnter(input.id, event)}
                      onDragLeave={(event) => handleDragLeave(input.id, event)}
                      onDragOver={(event) => { if (!running) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
                      onDrop={(event) => handleDrop(input, event)}
                    >
                      <UploadCloud size={30} aria-hidden="true" />
                      <strong>{dragTargetId === input.id ? "ここにドロップしてください" : "ファイルをドラッグ＆ドロップ"}</strong>
                      <span>または</span>
                      <label className="button secondary runner-file-button">
                        <input type="file" accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseFile(input, file); }} />
                        ファイルを選択
                      </label>
                      <small>対応形式：CSV、Excel（.xlsx）、JSON</small>
                    </div>

                    {state.fileKind === "csv" && state.sourceKind === "file" && (
                      <label className="runner-field compact">
                        <span>文字コード</span>
                        <select value={state.encoding} onChange={(event) => changeEncoding(input, event.target.value as CsvEncoding)}>
                          {Object.entries(encodingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    )}
                    {state.fileKind === "excel" && state.sourceKind === "file" && state.options && (
                      <label className="runner-field">
                        <span>Excelシート</span>
                        <select value={state.selectedOption} onChange={(event) => void selectStructuredSource(input, event.target.value, state.name ?? "Excel", state.size ?? 0, "excel")}>
                          {state.options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                    )}
                    {state.fileKind === "json" && state.sourceKind === "file" && state.options && (
                      <label className="runner-field">
                        <span>JSONの読み込み対象</span>
                        <select value={state.selectedOption} onChange={(event) => void selectStructuredSource(input, event.target.value, state.name ?? "JSON", state.size ?? 0, "json")}>
                          {state.options.map((option) => <option key={option}>{option}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                ) : (
                  <div role="tabpanel" className="runner-source-panel runner-google-panel">
                    <label className="runner-field full">
                      <span>スプレッドシートURL</span>
                      <div className="runner-input-with-icon"><Link2 size={18} aria-hidden="true" /><input type="url" placeholder="https://docs.google.com/spreadsheets/d/..." value={google.url} onChange={(event) => setGoogleForms((current) => ({ ...current, [input.id]: { ...google, url: event.target.value, status: "idle", error: undefined } }))} /></div>
                    </label>
                    <div className="runner-google-fields">
                      <label className="runner-field">
                        <span>シート選択</span>
                        <select disabled={!google.sheets.length} value={google.sheet} onChange={(event) => {
                          const sheet = event.target.value;
                          setGoogleForms((current) => ({ ...current, [input.id]: { ...google, sheet } }));
                          void prepareGoogleSheet(input, sheet, google.range);
                        }}>
                          {!google.sheets.length && <option>読み込み後に選択できます</option>}
                          {google.sheets.map((sheetName) => <option key={sheetName}>{sheetName}</option>)}
                        </select>
                      </label>
                      <label className="runner-field">
                        <span>範囲</span>
                        <input type="text" placeholder="例：A1:D100（省略可）" value={google.range} onChange={(event) => setGoogleForms((current) => ({ ...current, [input.id]: { ...google, range: event.target.value } }))} />
                      </label>
                    </div>
                    <button className="button secondary runner-google-load" disabled={!google.url.trim() || google.status === "loading"} onClick={() => void loadGoogleSheet(input)}>
                      {google.status === "loading" ? <LoaderCircle className="spin-icon" size={18} aria-hidden="true" /> : <CloudUpload size={18} aria-hidden="true" />}
                      {google.status === "loading" ? "読み込んでいます..." : "データを読み込む"}
                    </button>
                    <p className="runner-google-note"><Info size={16} aria-hidden="true" />リンクを知っている全員が閲覧できるスプレッドシートに対応しています。</p>
                    {google.error && <p className="runner-inline-error">{google.error}</p>}
                  </div>
                )}

                <InputMetadata state={state} activeSource={sourceTab} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="runner-section" id="column-mapping" aria-labelledby="column-mapping-title">
        <div className="runner-section-heading">
          <div><span className="runner-step-number">2</span><div><h2 id="column-mapping-title">列の対応を確認</h2><p>列名・別名・データ型・サンプル値から入力列を自動推測します。</p></div></div>
        </div>

        <div className="runner-mapping-list">
          {flow.inputs.map((input) => {
            const state = inputStates[input.id];
            if (!state?.analysis || state.sourceKind !== sourceTab) {
              return <div className="runner-mapping-empty" key={input.id}><Columns3 aria-hidden="true" /><div><h3>{input.label}</h3><p>データを読み込むと、必要な項目との対応候補を表示します。</p></div></div>;
            }
            return (
              <article className="runner-mapping-card" key={input.id}>
                <header><h3>{input.label}</h3><span>{state.analysis.headers.length}列を検出</span></header>
                <div className="runner-mapping-table-wrap">
                  <table className="runner-mapping-table">
                    <thead><tr><th>処理側の項目名</th><th>データ型</th><th>推測された入力列</th><th>推測状態</th><th>サンプル値</th></tr></thead>
                    <tbody>
                      {input.requiredColumns.map((column) => {
                        const match = state.mappings?.[column.name] ?? { score: 0, status: "unmapped" as const };
                        const samples = match.source ? state.analysis?.sampleValues[match.source] ?? [] : [];
                        return (
                          <tr key={column.name}>
                            <td><strong>{column.name}</strong><span className="runner-required-mark">必須</span></td>
                            <td>{typeLabels[column.type]}</td>
                            <td>
                              <select aria-label={`${column.name}に対応する入力列`} value={match.source ?? ""} onChange={(event) => changeMapping(input.id, column.name, event.target.value)}>
                                <option value="">選択してください</option>
                                {state.analysis?.headers.map((header) => <option key={header}>{header}</option>)}
                              </select>
                            </td>
                            <td><MatchStatus status={match.status} /></td>
                            <td className="runner-sample-values">{samples.length ? samples.join(" / ") : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>

        {error && executionStatus !== "failure" && <div className="error-message">{error}</div>}
        {running && <div className="processing-status"><span className="spinner" /><strong>{phase || "処理中"}</strong><button className="text-button danger" onClick={() => client.current?.cancel()}>キャンセル</button></div>}
        <div className="runner-execute-actions">
          <button className="button plain" disabled={running} onClick={() => dataSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><RefreshCw size={17} aria-hidden="true" />データを変更</button>
          <button className="button primary runner-execute-button" disabled={!canRun || running} onClick={() => void runSelectedFiles()}><Play size={17} aria-hidden="true" />{running ? "処理を実行しています..." : "処理を実行"}</button>
        </div>
        {!canRun && !running && <p className="runner-disabled-note">すべての必要な項目に入力列を対応させると実行できます。</p>}
      </section>

      <section className="runner-section" id="run-result" aria-labelledby="run-result-title">
        <div className="runner-section-heading">
          <div><span className="runner-step-number">3</span><div><h2 id="run-result-title">実行結果</h2><p>処理の状態と結果データを確認・保存できます。</p></div></div>
        </div>

        {executionStatus === "idle" && <div className="runner-result-empty"><Database aria-hidden="true" /><p>処理を実行すると、ここに結果が表示されます。</p></div>}
        {executionStatus === "failure" && <div className="runner-result-status failure"><AlertTriangle aria-hidden="true" /><div><strong>失敗</strong><p>{error ?? "処理を完了できませんでした。"}</p></div></div>}
        {executionStatus === "success" && result && (
          <div className="runner-result" aria-live="polite">
            <div className="runner-result-status success"><CheckCircle2 aria-hidden="true" /><div><strong>成功</strong><p>処理が正常に完了しました。</p></div></div>
            <dl className="runner-result-metrics">
              <div><dt>入力行数</dt><dd>{inputRowCount.toLocaleString()}行</dd></div>
              <div><dt>出力行数</dt><dd>{result.totalRows.toLocaleString()}行</dd></div>
              <div><dt>処理時間</dt><dd>{result.elapsedMs.toLocaleString()}ms</dd></div>
            </dl>
            <div className="runner-result-preview">
              <h3>結果プレビュー</h3>
              <ResultTable result={result} overflowNote="画面は先頭100件のみ表示しています。保存ファイルには全件が含まれます。" />
            </div>
            <div className="runner-output-actions" aria-label="結果を保存">
              {downloadUrl && <a className="button secondary" href={downloadUrl} download={withExtension(flow.output.fileName, ".csv")}><FileText size={17} aria-hidden="true" />CSVで保存</a>}
              <button className="button secondary" onClick={() => void saveExcel()}><FileSpreadsheet size={17} aria-hidden="true" />Excelで保存</button>
              <button className="button secondary" onClick={saveJson}><FileJson size={17} aria-hidden="true" />JSONで保存</button>
              <button className="button secondary" onClick={() => void outputToGoogleSheets()}><Sheet size={17} aria-hidden="true" />Googleスプレッドシートへ出力</button>
            </div>
          </div>
        )}
      </section>

      {notice && <div className="portal-toast" role="status">{notice}</div>}
    </main>
  );
}

function InputMetadata({ state, activeSource }: { state: InputState; activeSource: DataSourceKind }) {
  if (state.sourceKind !== activeSource || (!state.name && state.status === "empty")) return null;
  return (
    <div className={`runner-input-metadata ${state.status}`}>
      {state.status === "analyzing" ? <LoaderCircle className="spin-icon" aria-hidden="true" /> : state.status === "ready" ? <Check aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
      <div>
        <strong>{state.status === "analyzing" ? "データを解析しています" : state.name}</strong>
        {state.analysis && <p>行数 {state.analysis.rowCount.toLocaleString()}・列数 {state.analysis.headers.length.toLocaleString()}・{state.fileKind === "csv" ? `文字コード ${encodingLabels[state.analysis.detectedEncoding]}` : state.fileKind === "excel" ? `シート ${state.selectedOption}` : state.fileKind === "json" ? `読み込み対象 ${state.selectedOption}` : `シート ${state.selectedOption}`}</p>}
        {state.error && <p>{state.error}</p>}
      </div>
    </div>
  );
}

function MatchStatus({ status }: { status: ColumnMatch["status"] }) {
  if (status === "automatic") return <span className="runner-match-status automatic"><CheckCircle2 aria-hidden="true" />自動対応</span>;
  if (status === "review") return <span className="runner-match-status review"><AlertTriangle aria-hidden="true" />要確認</span>;
  return <span className="runner-match-status unmapped"><CircleDashed aria-hidden="true" />未対応</span>;
}

function emptyInputState(): InputState {
  return { encoding: "auto", status: "empty" };
}

function emptyGoogleForm(): GoogleForm {
  return { url: "", sheet: "", range: "", sheets: [], status: "idle" };
}

function csvFileFromRows(rows: TabularRows, name: string) {
  if (!rows.length || !rows[0]?.length) throw new Error("ヘッダー行を読み取れませんでした。");
  return new File([rowsToCsv(rows)], name, { type: "text/csv;charset=utf-8" });
}

function withExtension(fileName: string, extension: string) {
  return fileName.replace(/\.[^.]+$/, "") + extension;
}

function formatUpdatedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
