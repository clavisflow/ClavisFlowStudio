"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Columns3,
  Copy,
  CopyPlus,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DataSourceCard, DataSourcePicker, GoogleSheetModal } from "@/components/data-source-ui";
import { isAdminEmail } from "@/lib/admin-access";
import { inferColumnMatches, type ColumnMatch } from "@/lib/column-matching";
import { getBundledDemo, getBundledSampleFiles } from "@/lib/demo-flow";
import type { CsvEncoding, FileAnalysis, FlowInput, PublicFlow, QueryResult } from "@/lib/flow-types";
import { deletePublicFlowAsAdmin, loadPublicFlow } from "@/lib/flow-store";
import { ProcessingClient } from "@/lib/processing-client";
import { ResultTable } from "@/components/result-table";
import { recordSuccessfulRun } from "@/lib/portal-activity";
import { recordFlowUsage } from "@/lib/usage-store";
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
  range?: string;
  headerRow: number;
  delimiter: FlowInput["delimiter"];
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
  const { user } = useAuth();
  const [flow, setFlow] = useState<PublicFlow>();
  const [inputStates, setInputStates] = useState<Record<string, InputState>>({});
  const [googleForms, setGoogleForms] = useState<Record<string, GoogleForm>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleModalUrl, setGoogleModalUrl] = useState("");
  const [googleModalLoading, setGoogleModalLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult>();
  const [executionStatus, setExecutionStatus] = useState<"idle" | "success" | "failure">("idle");
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const [notice, setNotice] = useState("");
  const [adminDeleteOpen, setAdminDeleteOpen] = useState(false);
  const [adminDeleteBusy, setAdminDeleteBusy] = useState(false);
  const [adminDeleteError, setAdminDeleteError] = useState("");
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
        setInputStates(Object.fromEntries(loaded.inputs.map((input) => [input.id, emptyInputState(input)])));
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
    meta: Pick<InputState, "sourceKind" | "fileKind" | "name" | "size" | "options" | "selectedOption"> & Partial<Pick<InputState, "range" | "headerRow" | "delimiter">>,
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
      const current = inputStates[input.id] ?? emptyInputState(input);
      const headerRow = meta.fileKind === "json" ? 1 : meta.headerRow ?? current.headerRow;
      const delimiter = meta.fileKind === "csv" ? meta.delimiter ?? current.delimiter : ",";
      const analysis = await client.current.analyze(file, encoding, delimiter, headerRow);
      const mappings = inferColumnMatches(requiredInputColumns(input), analysis);
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
        const state = inputStates[input.id] ?? emptyInputState(input);
        await analyzePrepared(input, file, {
          sourceKind: "file",
          fileKind: "csv",
          name: file.name,
          size: file.size,
          headerRow: state.headerRow,
          delimiter: state.delimiter,
        }, state.encoding);
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
    const state = inputStates[input.id] ?? emptyInputState(input);
    const rows = kind === "excel" ? applyA1Range(entry.rows, state.range ?? "") : entry.rows;
    const csvFile = await csvFileFromRows(rows, `${originalName}-${entry.name}.csv`, state.encoding);
    await analyzePrepared(input, csvFile, {
      sourceKind: "file",
      fileKind: kind,
      name: originalName,
      size,
      options: collection.entries.map((candidate) => candidate.name),
      selectedOption: entry.name,
      range: state.range,
      headerRow: state.headerRow,
      delimiter: state.delimiter,
    }, state.encoding === "auto" ? "utf-8" : state.encoding);
  }

  async function loadGoogleSheet(input: FlowInput, urlOverride?: string) {
    const initial = googleForms[input.id] ?? emptyGoogleForm();
    const form = { ...initial, url: urlOverride ?? initial.url };
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
      return true;
    } catch (googleError) {
      const message = googleError instanceof Error ? googleError.message : "スプレッドシートを読み込めませんでした。";
      setGoogleForms((current) => ({ ...current, [input.id]: { ...form, status: "error", error: message } }));
      setInputStates((current) => ({ ...current, [input.id]: { ...current[input.id], sourceKind: "google", fileKind: "google", status: "error", error: message } }));
      return false;
    }
  }

  async function prepareGoogleSheet(input: FlowInput, sheetName: string, range: string) {
    const collection = sourceCollections.current[input.id];
    const entry = collection?.entries.find((candidate) => candidate.name === sheetName);
    if (!entry) return;
    try {
      const rangedRows = applyA1Range(entry.rows, range);
      const state = inputStates[input.id] ?? emptyInputState(input);
      const csvFile = await csvFileFromRows(rangedRows, `${sheetName}.csv`, state.encoding);
      await analyzePrepared(input, csvFile, {
        sourceKind: "google",
        fileKind: "google",
        name: `Googleスプレッドシート・${sheetName}`,
        size: csvFile.size,
        options: collection.entries.map((candidate) => candidate.name),
        selectedOption: sheetName,
        range,
        headerRow: state.headerRow,
        delimiter: state.delimiter,
      }, state.encoding === "auto" ? "utf-8" : state.encoding);
    } catch (rangeError) {
      const message = rangeError instanceof Error ? rangeError.message : "範囲を読み込めませんでした。";
      setInputStates((current) => ({ ...current, [input.id]: { ...current[input.id], sourceKind: "google", status: "error", error: message } }));
    }
  }

  function changeEncoding(input: FlowInput, encoding: CsvEncoding) {
    const file = preparedFiles.current[input.id];
    const state = inputStates[input.id];
    setInputStates((current) => ({ ...current, [input.id]: { ...current[input.id], encoding } }));
    if (!state) return;
    const next = { ...state, encoding };
    if (state.fileKind === "csv" && file) {
      void analyzePrepared(input, file, next, encoding);
    } else if ((state.fileKind === "excel" || state.fileKind === "json") && state.selectedOption) {
      const entry = sourceCollections.current[input.id]?.entries.find((candidate) => candidate.name === state.selectedOption);
      if (entry) {
        const rows = state.fileKind === "excel" ? applyA1Range(entry.rows, state.range ?? "") : entry.rows;
        void csvFileFromRows(rows, `${state.name ?? "データ"}-${entry.name}.csv`, encoding)
          .then((prepared) => analyzePrepared(input, prepared, next, encoding === "auto" ? "utf-8" : encoding));
      }
    } else if (state.fileKind === "google" && state.selectedOption) {
      const entry = sourceCollections.current[input.id]?.entries.find((candidate) => candidate.name === state.selectedOption);
      if (entry) {
        void csvFileFromRows(applyA1Range(entry.rows, state.range ?? ""), `${entry.name}.csv`, encoding)
          .then((prepared) => analyzePrepared(input, prepared, next, encoding === "auto" ? "utf-8" : encoding));
      }
    }
  }

  function changeSourceSetting(input: FlowInput, patch: Partial<Pick<InputState, "headerRow" | "delimiter" | "range">>) {
    const state = inputStates[input.id];
    if (!state) return;
    const next = { ...state, ...patch };
    setInputStates((current) => ({ ...current, [input.id]: next }));
    const file = preparedFiles.current[input.id];
    if (state.fileKind === "csv" && file) {
      void analyzePrepared(input, file, next, next.encoding);
    } else if (state.fileKind === "excel" && state.selectedOption) {
      const entry = sourceCollections.current[input.id]?.entries.find((candidate) => candidate.name === state.selectedOption);
      if (entry) {
        void csvFileFromRows(applyA1Range(entry.rows, next.range ?? ""), `${state.name ?? "Excel"}-${entry.name}.csv`, next.encoding)
          .then((prepared) => analyzePrepared(input, prepared, next, next.encoding === "auto" ? "utf-8" : next.encoding));
      }
    } else if (state.fileKind === "google" && state.selectedOption) {
      setGoogleForms((current) => ({
        ...current,
        [input.id]: { ...(current[input.id] ?? emptyGoogleForm()), range: next.range ?? "" },
      }));
      void prepareGoogleSheet(input, state.selectedOption, next.range ?? "");
    }
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

  function orderedFlowInputs() {
    return flow?.inputs ?? [];
  }

  function isPopulated(inputId: string) {
    const state = inputStates[inputId];
    return Boolean(state?.sourceKind || state?.name || state?.status !== "empty");
  }

  async function addFiles(files: File[]) {
    if (!flow || running || !files.length) return;
    const targets = orderedFlowInputs().filter((input) => !isPopulated(input.id));
    if (!targets.length) {
      setError("この処理に追加できるデータソースはすべて設定済みです。");
      return;
    }
    const accepted = files.filter((file) => ["csv", "xlsx", "json"].includes(file.name.split(".").pop()?.toLowerCase() ?? ""));
    if (accepted.length !== files.length) {
      setError("CSV、Excel（.xlsx）、JSON以外のファイルは追加できません。");
    }
    await Promise.all(accepted.slice(0, targets.length).map((file, index) => chooseFile(targets[index], file)));
    if (accepted.length > targets.length) {
      setError(`追加できるデータソースは残り${targets.length}件です。超過したファイルは追加していません。`);
    }
  }

  function swapInputSources(inputId: string, direction: -1 | 1) {
    if (!flow) return;
    const populated = flow.inputs.filter((input) => isPopulated(input.id));
    const index = populated.findIndex((input) => input.id === inputId);
    const target = populated[index + direction];
    const source = populated[index];
    if (!source || !target) return;

    swapRefEntries(preparedFiles.current, source.id, target.id);
    swapRefEntries(sourceCollections.current, source.id, target.id);
    setGoogleForms((current) => swapStateEntries(current, source.id, target.id));
    setInputStates((current) => {
      const sourceState = current[source.id];
      const targetState = current[target.id];
      return {
        ...current,
        [source.id]: rematchInputState(targetState, source),
        [target.id]: rematchInputState(sourceState, target),
      };
    });
    clearResult();
  }

  function removeInput(input: FlowInput) {
    delete preparedFiles.current[input.id];
    delete sourceCollections.current[input.id];
    setInputStates((current) => ({ ...current, [input.id]: emptyInputState(input) }));
    setGoogleForms((current) => ({ ...current, [input.id]: emptyGoogleForm() }));
    clearResult();
  }

  async function addGoogleSheet() {
    if (!flow || !googleModalUrl.trim()) return;
    const input = orderedFlowInputs().find((candidate) => !isPopulated(candidate.id));
    if (!input) {
      setError("この処理に追加できるデータソースはすべて設定済みです。");
      setGoogleModalOpen(false);
      return;
    }
    setGoogleModalLoading(true);
    const loaded = await loadGoogleSheet(input, googleModalUrl.trim());
    setGoogleModalLoading(false);
    if (loaded) {
      setGoogleModalOpen(false);
      setGoogleModalUrl("");
    }
  }

  function selectedFiles(): SelectedFile[] {
    if (!flow) return [];
    return flow.inputs.map((input) => {
      const file = preparedFiles.current[input.id];
      const state = inputStates[input.id];
      const columnMapping = Object.fromEntries(requiredInputColumns(input).map((column) => [column.name, state?.mappings?.[column.name]?.source ?? ""]));
      if (!file || state?.status !== "ready" || Object.values(columnMapping).some((value) => !value)) {
        throw new Error(`${input.label}のデータと列の対応を確認してください。`);
      }
      return {
        tableName: input.tableName,
        file,
        encoding: state.encoding,
        delimiter: state.fileKind === "csv" ? state.delimiter : ",",
        headerRow: state.fileKind === "json" ? 1 : state.headerRow,
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
      void recordFlowUsage(flow.publicId).catch(() => undefined);
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
    setRunning(true);
    setPhase("サンプルを読み込んでいます");
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
      setInputStates(sampleStates);
      await execute(selected);
    } catch (sampleError) {
      setExecutionStatus("failure");
      setError(sampleError instanceof Error ? sampleError.message : "サンプルを実行できませんでした。");
    } finally {
      setRunning(false);
      setPhase("");
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
      preparedFile = await csvFileFromRows(first.data as TabularRows, `${first.sheet}.csv`, "utf-8");
      fileKind = "excel";
      encoding = "utf-8";
      headerRow = 1;
    } else if (extension === "json") {
      const targets = jsonTargets(JSON.parse(await sourceFile.text()) as unknown);
      const first = targets[0];
      if (!first) throw new Error(`${sourceFile.name}に表として読み込めるデータがありません。`);
      options = targets.map((target) => target.path);
      selectedOption = first.path;
      preparedFile = await csvFileFromRows(first.rows, "sample.json.csv", "utf-8");
      fileKind = "json";
      encoding = "utf-8";
      headerRow = 1;
    } else if (extension !== "csv") {
      throw new Error("サンプルはCSV、Excel（.xlsx）、JSONに対応しています。");
    }

    const analysis = await client.current.analyze(preparedFile, encoding, input.delimiter, headerRow);
    const requiredColumns = requiredInputColumns(input);
    const mappings = inferColumnMatches(requiredColumns, analysis);
    if (requiredColumns.some((column) => !mappings[column.name]?.source)) {
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
        range: "",
        headerRow,
        delimiter: input.delimiter,
        error: analysis.warning,
      },
      selected: {
        tableName: input.tableName,
        file: preparedFile,
        encoding,
        delimiter: input.delimiter,
        headerRow,
        columnMapping: Object.fromEntries(requiredColumns.map((column) => [column.name, mappings[column.name].source!])),
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

  async function copyResultTable() {
    if (!result) return;
    const tsv = [
      result.columns.join("\t"),
      ...result.rows.map((row) => result.columns.map((column) => String(row[column] ?? "").replaceAll("\t", " ")).join("\t")),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setNotice("クリップボードにコピーしました。ExcelやGoogleスプレッドシートへ貼り付けられます。");
    } catch {
      downloadBlob(new Blob([tsv], { type: "text/tab-separated-values" }), "処理結果.tsv");
      setNotice("クリップボードへコピーできなかったため、結果をTSVファイルで保存しました。");
    }
    window.setTimeout(() => setNotice(""), 4200);
  }

  async function confirmAdminDelete() {
    if (!flow) return;
    setAdminDeleteBusy(true);
    setAdminDeleteError("");
    try {
      await deletePublicFlowAsAdmin(flow.publicId);
      window.location.assign("/");
    } catch (deleteError) {
      setAdminDeleteError(deleteError instanceof Error ? deleteError.message : "公開処理を削除できませんでした。");
    } finally {
      setAdminDeleteBusy(false);
    }
  }

  if (loading) {
    return <main className="tool-shell"><div className="loading-row"><span className="spinner" />処理を読み込んでいます</div></main>;
  }
  if (!flow) {
    return <main className="tool-shell"><div className="error-message">{error ?? "処理が見つかりません。"}</div></main>;
  }

  const hasBundledSamples = Boolean(getBundledSampleFiles(flow.publicId)) ||
    Boolean(flow.samples?.length === flow.inputs.length && flow.inputs.every((input) => flow.samples?.some((sample) => sample.inputId === input.id)));
  const canAdminDelete = isAdminEmail(user?.email) && !getBundledDemo(flow.publicId);
  const canRun = flow.inputs.every((input) => {
    const state = inputStates[input.id];
    return state?.status === "ready" &&
      requiredInputColumns(input).every((column) => Boolean(state.mappings?.[column.name]?.source));
  });
  const orderedInputs = orderedFlowInputs();
  const populatedInputs = orderedInputs.filter((input) => isPopulated(input.id));
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
            <div><dt>更新者</dt><dd>{flow.updatedBy ?? "---"}</dd></div>
          </dl>
          <div className="runner-hero-actions">
            {hasBundledSamples && (
              <button className="runner-sample-button" aria-busy={running} disabled={running} onClick={() => void runDemoSample()}>
                {running ? <LoaderCircle className="spin-icon" size={18} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                {running ? "サンプルを実行しています..." : "サンプルですぐ実行"}
              </button>
            )}
            <a className="runner-copy-button" href={`/flows/new/?copy=${encodeURIComponent(flow.publicId)}`}>
              <CopyPlus size={17} aria-hidden="true" />コピーして処理を作る
            </a>
            {canAdminDelete && (
              <button
                type="button"
                className="runner-admin-delete-button"
                disabled={adminDeleteBusy}
                onClick={() => { setAdminDeleteError(""); setAdminDeleteOpen(true); }}
              >
                <Trash2 size={17} aria-hidden="true" />完全に削除
              </button>
            )}
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

        <DataSourcePicker
          dragging={dropActive}
          disabled={running}
          onDraggingChange={setDropActive}
          onFiles={(files) => void addFiles(files)}
          onGoogle={() => setGoogleModalOpen(true)}
        />

        <div className="data-source-list">
          {!populatedInputs.length && <DataSourceEmpty />}
          {populatedInputs.map((input, cardIndex) => {
            const state = inputStates[input.id] ?? emptyInputState(input);
            const google = googleForms[input.id] ?? emptyGoogleForm();
            return (
              <DataSourceCard
                key={input.id}
                index={cardIndex}
                total={populatedInputs.length}
                sourceName={input.label}
                resourceName={state.name ?? "データを読み込んでいます"}
                kindLabel={sourceKindLabel(state.fileKind)}
                identifier={input.tableName}
                rowCount={state.analysis?.rowCount}
                columnCount={state.analysis?.headers.length}
                busy={state.status === "analyzing"}
                actionsDisabled={running}
                error={state.error}
                onMove={(direction) => swapInputSources(input.id, direction)}
                onDelete={() => removeInput(input)}
                afterSettings={(
                  <div className="data-source-required">
                    <span>必要な項目（すべて必須）</span>
                    <div>{requiredInputColumns(input).length ? requiredInputColumns(input).map((column) => <b key={column.name}>{column.name}</b>) : <b>なし</b>}</div>
                  </div>
                )}
              >
                  <label className="runner-field">
                    <span>文字コード</span>
                    <select value={state.encoding} disabled={running || state.status === "analyzing"} onChange={(event) => changeEncoding(input, event.target.value as CsvEncoding)}>
                      {Object.entries(encodingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  {state.fileKind === "csv" && (
                    <label className="runner-field">
                      <span>区切り文字</span>
                      <select value={state.delimiter} disabled={running || state.status === "analyzing"} onChange={(event) => changeSourceSetting(input, { delimiter: event.target.value as FlowInput["delimiter"] })}>
                        <option value=",">カンマ</option><option value="\t">タブ</option><option value=";">セミコロン</option>
                      </select>
                    </label>
                  )}
                  {state.fileKind !== "json" && (
                    <label className="runner-field">
                      <span>ヘッダー行</span>
                      <input type="number" min={1} value={state.headerRow} disabled={running || state.status === "analyzing"} onChange={(event) => changeSourceSetting(input, { headerRow: Math.max(1, Number(event.target.value) || 1) })} />
                    </label>
                  )}
                  {(state.fileKind === "excel" || state.fileKind === "google") && (
                    <label className="runner-field">
                      <span>シート</span>
                      <select
                        value={state.selectedOption ?? ""}
                        disabled={running || state.status === "analyzing" || !state.options?.length}
                        onChange={(event) => {
                          if (state.fileKind === "excel") void selectStructuredSource(input, event.target.value, state.name ?? "Excel", state.size ?? 0, "excel");
                          else {
                            setGoogleForms((current) => ({ ...current, [input.id]: { ...google, sheet: event.target.value } }));
                            void prepareGoogleSheet(input, event.target.value, state.range ?? "");
                          }
                        }}
                      >
                        {state.options?.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </label>
                  )}
                  {(state.fileKind === "excel" || state.fileKind === "google") && (
                    <label className="runner-field">
                      <span>読み込み範囲</span>
                      <input type="text" placeholder="例：A1:D100（省略可）" value={state.range ?? ""} disabled={running || state.status === "analyzing"} onChange={(event) => changeSourceSetting(input, { range: event.target.value })} />
                    </label>
                  )}
                  {state.fileKind === "json" && state.options && (
                    <label className="runner-field">
                      <span>JSONの読み込み対象</span>
                      <select value={state.selectedOption} disabled={running || state.status === "analyzing"} onChange={(event) => void selectStructuredSource(input, event.target.value, state.name ?? "JSON", state.size ?? 0, "json")}>
                        {state.options.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </label>
                  )}
              </DataSourceCard>
            );
          })}
        </div>
      </section>

      <section className="runner-section" id="column-mapping" aria-labelledby="column-mapping-title">
        <div className="runner-section-heading">
          <div><span className="runner-step-number">2</span><div><h2 id="column-mapping-title">列の対応を確認</h2><p>必要な項目と入力列の対応を確認し、未対応の項目を選択してください。</p></div></div>
        </div>

        <div className="runner-mapping-list">
          {!populatedInputs.length && (
            <div className="runner-mapping-empty">
              <Columns3 aria-hidden="true" />
              <div><h3>先にデータを選択してください</h3><p>STEP 1でデータを読み込むと、自動推測した列の対応を表示します。</p></div>
            </div>
          )}
          {populatedInputs.map((input) => {
            const state = inputStates[input.id];
            if (!state?.analysis) {
              return <div className="runner-mapping-empty" key={input.id}><Columns3 aria-hidden="true" /><div><h3>{input.label}</h3><p>データの解析完了後に列の対応を表示します。</p></div></div>;
            }
            const analysis = state.analysis;
            return (
              <article className="runner-mapping-card" key={input.id}>
                <header>
                  <div><h3>{input.label}</h3><p>{state.name}</p></div>
                  <span>{analysis.headers.length}列を検出</span>
                </header>
                <div className="runner-mapping-table-wrap">
                  <table className="runner-mapping-table">
                    <thead><tr><th>処理側の項目名</th><th>データ型</th><th>推測された入力列</th><th>推測状態</th><th>サンプル値</th></tr></thead>
                    <tbody>
                      {requiredInputColumns(input).map((column) => {
                        const match = state.mappings?.[column.name] ?? { score: 0, status: "unmapped" as const };
                        const samples = match.source ? analysis.sampleValues[match.source] ?? [] : [];
                        return (
                          <tr key={column.name}>
                            <td><strong>{column.name}</strong><span className="runner-required-mark">必須</span></td>
                            <td>{typeLabels[column.type]}</td>
                            <td>
                              <select aria-label={`${column.name}に対応する入力列`} value={match.source ?? ""} onChange={(event) => changeMapping(input.id, column.name, event.target.value)}>
                                <option value="">選択してください</option>
                                {analysis.headers.map((header) => <option key={header}>{header}</option>)}
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
          <button className="button primary runner-execute-button" aria-busy={running} disabled={!canRun || running} onClick={() => void runSelectedFiles()}>{running ? <LoaderCircle className="spin-icon" size={18} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{running ? "処理を実行しています..." : "処理を実行"}</button>
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
              <button className="button secondary" onClick={() => void copyResultTable()}><Copy size={17} aria-hidden="true" />クリップボードにコピー</button>
            </div>
          </div>
        )}
      </section>

      <GoogleSheetModal
        open={googleModalOpen}
        url={googleModalUrl}
        loading={googleModalLoading}
        onUrlChange={setGoogleModalUrl}
        onClose={() => setGoogleModalOpen(false)}
        onSubmit={() => void addGoogleSheet()}
      />

      {adminDeleteOpen && canAdminDelete && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title">
            <h2 id="admin-delete-title">この公開処理を完全に削除しますか？</h2>
            <p>公開ページ、処理定義、全バージョン、サンプルデータ、お気に入り記録、利用数を削除します。この操作は元に戻せません。</p>
            {adminDeleteError && <div className="error-message" role="alert">{adminDeleteError}</div>}
            <div className="confirmation-actions">
              <button type="button" className="button plain" disabled={adminDeleteBusy} onClick={() => setAdminDeleteOpen(false)}>キャンセル</button>
              <button
                type="button"
                className="button danger-button"
                aria-busy={adminDeleteBusy}
                disabled={adminDeleteBusy}
                autoFocus
                onClick={() => void confirmAdminDelete()}
              >
                {adminDeleteBusy && <LoaderCircle className="spin-icon" size={18} aria-hidden="true" />}
                {adminDeleteBusy ? "削除しています..." : "完全に削除する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="portal-toast" role="status">{notice}</div>}
    </main>
  );
}

function MatchStatus({ status }: { status: ColumnMatch["status"] }) {
  if (status === "automatic") return <span className="runner-match-status automatic"><CheckCircle2 aria-hidden="true" />自動対応</span>;
  if (status === "review") return <span className="runner-match-status review"><AlertTriangle aria-hidden="true" />要確認</span>;
  return <span className="runner-match-status unmapped"><CircleDashed aria-hidden="true" />未対応</span>;
}

function DataSourceEmpty() {
  return (
    <div className="data-source-empty">
      <Columns3 aria-hidden="true" />
      <div>
        <h3>データソースはまだありません</h3>
        <p>上の領域へファイルをドロップするか、Googleスプレッドシートを追加してください。</p>
      </div>
    </div>
  );
}

function swapRefEntries<T>(record: Record<string, T>, firstId: string, secondId: string) {
  const first = record[firstId];
  const second = record[secondId];
  if (second === undefined) delete record[firstId];
  else record[firstId] = second;
  if (first === undefined) delete record[secondId];
  else record[secondId] = first;
}

function swapStateEntries<T>(record: Record<string, T>, firstId: string, secondId: string): Record<string, T> {
  const next = { ...record };
  swapRefEntries(next, firstId, secondId);
  return next;
}

function requiredInputColumns(input: FlowInput) {
  return input.requiredColumns.filter((column) => column.required);
}

function rematchInputState(state: InputState | undefined, input: FlowInput): InputState {
  if (!state) return emptyInputState(input);
  return {
    ...state,
    mappings: state.analysis ? inferColumnMatches(requiredInputColumns(input), state.analysis) : undefined,
  };
}

function emptyInputState(input: FlowInput): InputState {
  return {
    encoding: input.encoding ?? "auto",
    status: "empty",
    headerRow: input.headerRow ?? 1,
    delimiter: input.delimiter,
    range: "",
  };
}

function emptyGoogleForm(): GoogleForm {
  return { url: "", sheet: "", range: "", sheets: [], status: "idle" };
}

async function csvFileFromRows(rows: TabularRows, name: string, encoding: CsvEncoding) {
  if (!rows.length || !rows[0]?.length) throw new Error("ヘッダー行を読み取れませんでした。");
  const csv = rowsToCsv(rows);
  if (encoding === "shift_jis" || encoding === "cp932") {
    const iconv = await import("iconv-lite");
    return new File([new Uint8Array(iconv.encode(csv, "cp932"))], name, { type: "text/csv" });
  }
  const body = encoding === "utf-8-bom" ? `\uFEFF${csv}` : csv;
  return new File([body], name, { type: "text/csv;charset=utf-8" });
}

function sourceKindLabel(kind?: FileKind) {
  if (kind === "excel") return "Excel";
  if (kind === "json") return "JSON";
  if (kind === "google") return "Googleスプレッドシート";
  if (kind === "csv") return "CSV";
  return "読み込み中";
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
