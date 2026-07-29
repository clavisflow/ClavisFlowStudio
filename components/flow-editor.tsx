"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Code2, Copy, Download, ExternalLink, FileSpreadsheet, FlaskConical, Link2, LogIn, RefreshCw, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { createManagedFlow, editUrl, generateFlowSql, loadEditableFlow, loadPublicFlow, publicRunUrl, savedFlowFromPublicationError, setManagedFlowPublished, updateManagedFlow, uploadManagedFlowSamples } from "@/lib/flow-store";
import type { CsvEncoding, FileAnalysis, FlowDraft, FlowInput, InputColumn, ManagedFlow, PublicFlow, QueryResult } from "@/lib/flow-types";
import { ProcessingClient } from "@/lib/processing-client";
import { getSampleTemplate, sampleTemplates } from "@/lib/sample-templates";
import { getBundledSampleFiles } from "@/lib/demo-flow";
import { inspectSqlStructure } from "@/lib/sql-safety";
import { ResultTable } from "@/components/result-table";
import { useAuth } from "@/components/auth-provider";
import { validateSampleFile } from "@/lib/sample-files";
import { applyA1Range, jsonTargets, rowsToCsv, type TabularRows } from "@/lib/tabular-data";
import { flowCategories, flowCategoryLabels } from "@/lib/flow-categories";

type WizardStep = 1 | 2 | 3 | 4;
type PreviewResult = Omit<QueryResult, "csv">;
type EditorFileState = {
  id: string;
  name: string;
  size: number;
  status: "analyzing" | "ready" | "error";
  analysis?: FileAnalysis;
  error?: string;
  sourceKind?: "csv" | "excel" | "json" | "google";
  options?: string[];
  selectedOption?: string;
  range?: string;
};
type EditorSourceCollection = {
  kind: "excel" | "json" | "google";
  originalName: string;
  size: number;
  entries: Array<{ name: string; rows: TabularRows }>;
};
type EditorSourceSample = {
  inputId: string;
  fileName: string;
  url: string;
};

const inputTypes: InputColumn["type"][] = ["VARCHAR", "BIGINT", "DOUBLE", "DATE", "BOOLEAN"];
const encodingOptions: Array<{ value: CsvEncoding; label: string }> = [
  { value: "auto", label: "自動判定" },
  { value: "utf-8", label: "UTF-8" },
  { value: "utf-8-bom", label: "UTF-8 BOM" },
  { value: "shift_jis", label: "Shift-JIS" },
  { value: "cp932", label: "CP932（Windows-31J）" },
];
const wizardSteps: Array<{ number: WizardStep; label: string }> = [
  { number: 1, label: "入力ファイル" },
  { number: 2, label: "処理を作成" },
  { number: 3, label: "結果を確認" },
  { number: 4, label: "公開" },
];

function initialDraft(): FlowDraft {
  return {
    name: "",
    description: "",
    categories: [],
    inputs: [],
    sql: "",
    output: { fileName: "result.csv", encoding: "utf-8", enabled: false },
    duckdbVersion: "1.32.0",
  };
}

export function FlowEditor({ mode }: { mode: "create" | "edit" }) {
  const [draft, setDraft] = useState<FlowDraft>(initialDraft);
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [fileStates, setFileStates] = useState<Record<string, EditorFileState>>({});
  const [dragging, setDragging] = useState(false);
  const [editDragInputId, setEditDragInputId] = useState<string>();
  const [instruction, setInstruction] = useState("");
  const [generatedInstruction, setGeneratedInstruction] = useState<string>();
  const [hasGeneratedSql, setHasGeneratedSql] = useState(false);
  const [generationConfirmation, setGenerationConfirmation] = useState<"initial" | "regenerate">();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [copiedLink, setCopiedLink] = useState<"public" | "edit">();
  const [existing, setExisting] = useState<ManagedFlow>();
  const [publishedSnapshot, setPublishedSnapshot] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string>();
  const [publishedResult, setPublishedResult] = useState<ManagedFlow>();
  const [sampleFiles, setSampleFiles] = useState<Record<string, File>>({});
  const [sourceSamples, setSourceSamples] = useState<EditorSourceSample[]>([]);
  const [sourceTab, setSourceTab] = useState<"file" | "google">("file");
  const [googleUrls, setGoogleUrls] = useState<Record<string, string>>({});
  const [googleLoadingId, setGoogleLoadingId] = useState<string>();
  const [selectingSourceSamples, setSelectingSourceSamples] = useState(false);
  const [preview, setPreview] = useState<PreviewResult>();
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const files = useRef<Record<string, File>>({});
  const sourceCollections = useRef<Record<string, EditorSourceCollection>>({});
  const picker = useRef<HTMLInputElement>(null);
  const replacingInputId = useRef<string | undefined>(undefined);
  const client = useRef<ProcessingClient | null>(null);
  const { user, displayName, configured: authConfigured, signInWithGoogle } = useAuth();

  useEffect(() => {
    client.current = new ProcessingClient(setPhase);
    return () => client.current?.close();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeStep]);

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  useEffect(() => {
    if (mode !== "edit") return;
    const publicId = new URL(window.location.href).searchParams.get("flow") ?? "";
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? undefined;
    loadEditableFlow(publicId, token)
      .then(async (flow) => {
        const loadedInstruction = flow.instruction ?? flow.description;
        const loadedDownloadEnabled = flow.output.enabled !== false;
        const loadedDraft: FlowDraft = { name: flow.name, description: flow.description, categories: flow.categories ?? [], instruction: loadedInstruction, inputs: flow.inputs.map((input) => ({ ...input, headerRow: input.headerRow ?? 1 })), sql: flow.sql, output: flow.output, duckdbVersion: flow.duckdbVersion };
        setExisting(flow);
        setDraft(loadedDraft);
        setInstruction(loadedInstruction);
        setGeneratedInstruction(loadedInstruction);
        setHasGeneratedSql(true);
        setDownloadEnabled(loadedDownloadEnabled);
        setPublishedSnapshot(editorSnapshot(loadedDraft, loadedInstruction, loadedDownloadEnabled));
        setActiveStep(1);
        try {
          const publicFlow = await loadPublicFlow(publicId);
          setSourceSamples(editorSourceSamples(publicFlow));
        } catch {
          setSourceSamples([]);
        }
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "処理を読み込めませんでした。"))
      .finally(() => setLoading(false));
  }, [mode]);

  function nextTableNumber() {
    return draft.inputs.reduce((highest, input) => {
      const match = /^input_(\d+)$/.exec(input.tableName);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0) + 1;
  }

  function clearPreview() {
    setPreview(undefined);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(undefined);
    }
  }

  function openPicker(inputId?: string) {
    replacingInputId.current = inputId;
    picker.current?.click();
  }

  async function addFiles(selected: File[]) {
    setError(undefined);
    const unassignedInputs = draft.inputs.filter((input) => !files.current[input.id]);
    const available = unassignedInputs.length || 2 - draft.inputs.length;
    if (available <= 0) { setError("入力データは最大2件まで追加できます。"); return; }
    const validFiles = selected.filter(isSupportedEditorFile);
    if (validFiles.length !== selected.length) setError("CSV、Excel（.xlsx）、JSONのいずれかを選択してください。");
    if (validFiles.length > available) setError("入力データは最大2件までです。先頭のファイルを追加しました。");
    const selectedFiles = validFiles.slice(0, available);
    if (!selectedFiles.length) return;
    const preparedFiles = await Promise.all(selectedFiles.map(prepareEditorFile));

    if (unassignedInputs.length) {
      const assignments = preparedFiles.map((prepared, index) => ({ prepared, input: unassignedInputs[index] }));
      assignments.forEach(({ prepared, input }) => {
        files.current[input.id] = prepared.file;
        if (prepared.collection) sourceCollections.current[input.id] = prepared.collection;
      });
      setFileStates((current) => ({
        ...current,
        ...Object.fromEntries(assignments.map(({ prepared, input }) => [input.id, editorFileState(input.id, prepared)])),
      }));
      clearPreview();
      await Promise.all(assignments.map(({ prepared, input }) => analyzeFile(prepared.file, prepared.converted ? { ...input, encoding: "utf-8", headerRow: 1 } : input, false)));
      return;
    }

    const firstNumber = nextTableNumber();
    const additions = preparedFiles.map((prepared, index) => {
      const number = firstNumber + index;
      const id = crypto.randomUUID();
      const input: FlowInput = {
        id,
        label: prepared.originalName.replace(/\.(csv|xlsx|json)$/i, ""),
        tableName: `input_${number}`,
        encoding: "auto",
        delimiter: ",",
        headerRow: 1,
        requiredColumns: [],
      };
      files.current[id] = prepared.file;
      if (prepared.collection) sourceCollections.current[id] = prepared.collection;
      return { prepared, input };
    });

    setDraft((current) => ({
      ...current,
      inputs: [...current.inputs, ...additions.map(({ input }) => input)],
    }));
    setFileStates((current) => ({
      ...current,
      ...Object.fromEntries(additions.map(({ prepared, input }) => [input.id, editorFileState(input.id, prepared)])),
    }));
    clearPreview();
    await Promise.all(additions.map(({ prepared, input }) => analyzeFile(prepared.file, prepared.converted ? { ...input, encoding: "utf-8", headerRow: 1 } : input)));
  }

  async function replaceFile(inputId: string, file: File) {
    setError(undefined);
    if (!isSupportedEditorFile(file)) { setError("CSV、Excel（.xlsx）、JSONのいずれかを選択してください。"); return; }
    const currentInput = draft.inputs.find((input) => input.id === inputId);
    if (!currentInput) return;
    const prepared = await prepareEditorFile(file);
    files.current[inputId] = prepared.file;
    if (prepared.collection) sourceCollections.current[inputId] = prepared.collection;
    else delete sourceCollections.current[inputId];
    if (mode === "edit") {
      setFileStates((current) => ({ ...current, [inputId]: editorFileState(inputId, prepared) }));
      clearPreview();
      await analyzeFile(prepared.file, prepared.converted ? { ...currentInput, encoding: "utf-8", headerRow: 1 } : currentInput, false);
      return;
    }
    const updatedInput: FlowInput = {
      ...currentInput,
      label: prepared.originalName.replace(/\.(csv|xlsx|json)$/i, ""),
      encoding: "auto",
      delimiter: ",",
      headerRow: 1,
      requiredColumns: [],
    };
    setDraft((current) => ({ ...current, inputs: current.inputs.map((input) => input.id === inputId ? updatedInput : input) }));
    setFileStates((current) => ({ ...current, [inputId]: editorFileState(inputId, prepared) }));
    clearPreview();
    await analyzeFile(prepared.file, prepared.converted ? { ...updatedInput, encoding: "utf-8", headerRow: 1 } : updatedInput);
  }

  async function selectStructuredOption(inputId: string, option: string, rangeOverride?: string, encodingOverride?: CsvEncoding) {
    const input = draft.inputs.find((candidate) => candidate.id === inputId);
    const collection = sourceCollections.current[inputId];
    const entry = collection?.entries.find((candidate) => candidate.name === option);
    if (!input || !collection || !entry) return;
    try {
      const range = rangeOverride ?? fileStates[inputId]?.range ?? "";
      const encoding = encodingOverride ?? input.encoding;
      const rows = collection.kind === "excel" || collection.kind === "google" ? applyA1Range(entry.rows, range) : entry.rows;
      const file = await csvFileFromTabularRows(rows, `${collection.originalName}-${entry.name}.csv`, encoding);
      files.current[inputId] = file;
      setFileStates((current) => ({
        ...current,
        [inputId]: {
          ...current[inputId],
          status: "analyzing",
          selectedOption: entry.name,
          range,
          error: undefined,
        },
      }));
      clearPreview();
      await analyzeFile(file, { ...input, encoding }, mode !== "edit");
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "読み込み対象を変更できませんでした。");
    }
  }

  async function loadGoogleSheet(targetInput?: FlowInput) {
    const formKey = targetInput?.id ?? "new";
    const googleUrl = googleUrls[formKey] ?? "";
    setError(undefined);
    setGoogleLoadingId(formKey);
    try {
      const response = await fetch("/api/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: googleUrl }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "スプレッドシートを読み込めませんでした。");
      }
      const workbook = new File([await response.blob()], "Googleスプレッドシート.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const sheets = await readExcelFile(workbook);
      if (!sheets.length) throw new Error("読み込めるシートがありません。");
      let targetId = targetInput?.id;
      let targetDefinition = targetInput;
      if (!targetDefinition) {
        if (draft.inputs.length >= 2) throw new Error("入力データは最大2件までです。");
        targetId = crypto.randomUUID();
        targetDefinition = {
          id: targetId,
          label: sheets[0].sheet,
          tableName: `input_${nextTableNumber()}`,
          encoding: "utf-8",
          delimiter: ",",
          headerRow: 1,
          requiredColumns: [],
        };
        setDraft((current) => ({ ...current, inputs: [...current.inputs, targetDefinition!] }));
      }
      const collection: EditorSourceCollection = {
        kind: "google",
        originalName: "Googleスプレッドシート",
        size: workbook.size,
        entries: sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data as TabularRows })),
      };
      sourceCollections.current[targetId!] = collection;
      const existingState = fileStates[targetId!];
      const selectedSheet = collection.entries.some((entry) => entry.name === existingState?.selectedOption)
        ? existingState.selectedOption!
        : collection.entries[0].name;
      const range = existingState?.range ?? "";
      const rows = applyA1Range(collection.entries.find((entry) => entry.name === selectedSheet)!.rows, range);
      const prepared = {
        file: await csvFileFromTabularRows(rows, `${selectedSheet}.csv`, targetDefinition.encoding),
        originalName: `Googleスプレッドシート・${selectedSheet}`,
        originalSize: workbook.size,
        sourceKind: "google" as const,
        converted: true as const,
        collection,
        selectedOption: selectedSheet,
        range,
      };
      setGoogleUrls((current) => {
        const next = { ...current, [targetId!]: googleUrl };
        if (formKey === "new") delete next.new;
        return next;
      });
      files.current[targetId!] = prepared.file;
      setFileStates((current) => ({ ...current, [targetId!]: editorFileState(targetId!, prepared) }));
      clearPreview();
      await analyzeFile(prepared.file, targetDefinition, mode !== "edit");
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "スプレッドシートを読み込めませんでした。");
    } finally {
      setGoogleLoadingId(undefined);
    }
  }

  async function startSample(sampleId = sampleTemplates[0].id) {
    const sample = getSampleTemplate(sampleId);
    if (!sample) { setError("サンプルを確認できませんでした。"); return; }
    setError(undefined);
    try {
      const sampleFiles = await Promise.all(sample.files.map(async (definition) => {
        const response = await fetch(definition.url);
        if (!response.ok) throw new Error(`${definition.label}を読み込めませんでした。`);
        return new File([await response.arrayBuffer()], definition.name, { type: "text/csv" });
      }));
      await addFiles(sampleFiles);
      setDraft((current) => ({
        ...current,
        name: sample.flowName,
        description: sample.description,
        categories: sample.id === "sales-by-product" ? ["集計"]
          : sample.id === "attach-product-master" ? ["結合"]
          : sample.id === "low-inventory" ? ["抽出"]
          : sample.id === "customer-data-check" ? ["整形"]
          : ["チェック"],
        inputs: current.inputs.map((input, index) => ({ ...input, encoding: sample.files[index]?.encoding ?? input.encoding })),
        sql: sample.sql,
        output: sample.output,
      }));
      setInstruction(sample.instruction);
      setAiWarnings([]);
      setGeneratedInstruction(sample.instruction);
      setHasGeneratedSql(true);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "サンプルを読み込めませんでした。");
    }
  }

  useEffect(() => {
    if (mode !== "create") return;
    const params = new URL(window.location.href).searchParams;
    const copyId = params.get("copy");
    const sampleId = params.get("sample");
    if (copyId) {
      setLoading(true);
      loadPublicFlow(copyId)
        .then((flow) => {
          const copiedInstruction = flow.instruction ?? flow.description;
          const copiedDraft: FlowDraft = {
            name: `${flow.name}（コピー）`,
            description: flow.description,
            categories: flow.categories ?? [],
            instruction: copiedInstruction,
            inputs: flow.inputs.map((input) => ({ ...input, requiredColumns: input.requiredColumns.map((column) => ({ ...column })) })),
            sql: flow.sql,
            output: { ...flow.output },
            duckdbVersion: flow.duckdbVersion,
          };
          setDraft(copiedDraft);
          setInstruction(copiedInstruction);
          setGeneratedInstruction(copiedInstruction);
          setHasGeneratedSql(true);
          setDownloadEnabled(flow.output.enabled !== false);
          setSourceSamples(editorSourceSamples(flow));
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "コピー元の処理を読み込めませんでした。"))
        .finally(() => setLoading(false));
    } else if (sampleId) {
      void startSample(sampleId);
    }
    // URLで選ばれたサンプルは初回表示時だけ読み込む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function selectExistingSamples() {
    const selections = draft.inputs.map((input) => ({
      input,
      sample: sourceSamples.find((candidate) => candidate.inputId === input.id),
    }));
    if (!selections.length || selections.some(({ sample }) => !sample)) {
      setError("この処理で使えるサンプル一式を確認できませんでした。");
      return;
    }
    setError(undefined);
    setSelectingSourceSamples(true);
    clearPreview();
    try {
      const prepared = await Promise.all(selections.map(async ({ input, sample }) => ({
        input,
        ...(await prepareEditorSample(sample!)),
      })));
      for (const { input, file } of prepared) {
        files.current[input.id] = file;
        setFileStates((current) => ({
          ...current,
          [input.id]: { id: input.id, name: file.name, size: file.size, status: "analyzing" },
        }));
      }
      await Promise.all(prepared.map(({ input, file, converted }) =>
        analyzeFile(file, converted ? { ...input, encoding: "utf-8", headerRow: 1 } : input, false)));
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "サンプルを読み込めませんでした。");
    } finally {
      setSelectingSourceSamples(false);
    }
  }

  async function analyzeFile(file: File, input: FlowInput, updateDefinition = true) {
    if (!client.current) return;
    setFileStates((current) => ({
      ...current,
      [input.id]: { ...(current[input.id] ?? { id: input.id, name: file.name, size: file.size }), status: "analyzing", error: undefined },
    }));
    try {
      const analysis = await client.current.analyze(file, input.encoding, input.delimiter, input.headerRow ?? 1);
      const selectedEncoding = input.encoding === "auto" ? analysis.detectedEncoding : input.encoding;
      if (updateDefinition) {
        setDraft((current) => ({
          ...current,
          inputs: current.inputs.map((candidate) => candidate.id === input.id ? {
            ...candidate,
            encoding: selectedEncoding,
            requiredColumns: analysis.headers.map((name, index) => ({ name, type: analysis.columnTypes[index] ?? "VARCHAR", required: true })),
          } : candidate),
        }));
      }
      const missingColumns = updateDefinition ? [] : input.requiredColumns.filter((column) => column.required && !analysis.headers.includes(column.name));
      const validationError = missingColumns.length ? `必要な列がありません: ${missingColumns.map((column) => column.name).join("、")}` : undefined;
      setFileStates((current) => ({
        ...current,
        [input.id]: { ...current[input.id], status: analysis.warning || validationError ? "error" : "ready", analysis, error: analysis.warning ?? validationError },
      }));
    } catch (analysisError) {
      setFileStates((current) => ({
        ...current,
        [input.id]: { ...current[input.id], status: "error", error: analysisError instanceof Error ? analysisError.message : "CSVを解析できませんでした。" },
      }));
    }
  }

  function updateInput(inputId: string, changes: Partial<FlowInput>, reanalyze = false) {
    const currentInput = draft.inputs.find((input) => input.id === inputId);
    if (!currentInput) return;
    const updated = { ...currentInput, ...changes };
    setDraft((current) => ({ ...current, inputs: current.inputs.map((input) => input.id === inputId ? updated : input) }));
    clearPreview();
    const file = files.current[inputId];
    if (reanalyze && file) void analyzeFile(file, updated);
  }

  function updateColumnType(inputId: string, columnIndex: number, type: InputColumn["type"]) {
    const input = draft.inputs.find((candidate) => candidate.id === inputId);
    if (!input) return;
    updateInput(inputId, { requiredColumns: input.requiredColumns.map((column, index) => index === columnIndex ? { ...column, type } : column) });
  }

  function changeEditorEncoding(input: FlowInput, state: EditorFileState, encoding: CsvEncoding) {
    const structured = state.sourceKind === "excel" || state.sourceKind === "json" || state.sourceKind === "google";
    if (structured && state.selectedOption) {
      updateInput(input.id, { encoding });
      void selectStructuredOption(input.id, state.selectedOption, state.range, encoding);
      return;
    }
    updateInput(input.id, { encoding }, true);
  }

  function removeFile(inputId: string) {
    delete files.current[inputId];
    delete sourceCollections.current[inputId];
    setDraft((current) => ({ ...current, inputs: current.inputs.filter((input) => input.id !== inputId) }));
    setFileStates((current) => {
      const next = { ...current };
      delete next[inputId];
      return next;
    });
    clearPreview();
    setError(undefined);
  }

  function canLeaveStepOne() {
    return draft.inputs.length > 0 && draft.inputs.every((input) => fileStates[input.id]?.status === "ready");
  }

  function goToProcessing() {
    setError(undefined);
    if (!draft.inputs.length) { setError("入力データを1件以上追加してください。"); return; }
    const invalid = draft.inputs.find((input) => fileStates[input.id]?.status !== "ready");
    if (invalid) { setError(`${fileStates[invalid.id]?.name ?? invalid.label}の解析エラーを解消してください。`); return; }
    setActiveStep(2);
  }

  async function generateAndPreview(confirmed = false) {
    setError(undefined);
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) { setError("やりたい処理を日本語で入力してください。"); return; }
    const needsGeneration = !draft.sql.trim() || generatedInstruction !== trimmedInstruction;
    if (needsGeneration && !confirmed) {
      setGenerationConfirmation(hasGeneratedSql ? "regenerate" : "initial");
      return;
    }
    setGenerationConfirmation(undefined);
    setAiGenerating(true);
    try {
      let sql = draft.sql;
      if (needsGeneration) {
        const generated = await generateFlowSql(trimmedInstruction, draft.inputs);
        sql = generated.sql;
        setAiWarnings(generated.warnings);
        setDraft((current) => ({ ...current, sql }));
        setGeneratedInstruction(trimmedInstruction);
        setHasGeneratedSql(true);
      }
      await runPreview(sql);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "SQLを生成できませんでした。");
    } finally {
      setAiGenerating(false);
    }
  }

  async function runPreview(sqlOverride = draft.sql) {
    setError(undefined);
    const preparedDraft = prepareDraft({ ...draft, sql: sqlOverride }, fileStates, instruction, downloadEnabled);
    const validationError = validatePreviewDraft(preparedDraft);
    if (validationError) { setError(validationError); return; }
    const missingFile = draft.inputs.find((input) => !files.current[input.id]);
    if (missingFile) { setError("結果を確認するには、Step 1でテスト用CSVを追加してください。"); return; }
    for (const input of draft.inputs) {
      const headers = fileStates[input.id]?.analysis?.headers ?? [];
      const missingColumns = input.requiredColumns.filter((column) => column.required && !headers.includes(column.name));
      if (missingColumns.length) { setError(`${input.label}に必要な列がありません: ${missingColumns.map((column) => column.name).join("、")}`); return; }
    }
    if (!client.current) return;
    clearPreview();
    setActiveStep(3);
    setPreviewing(true);
    setPhase("実行準備中");
    try {
      const flow = { ...preparedDraft, publicId: "preview", version: 1 };
      const result = await client.current.run(flow, preparedDraft.inputs.map((input) => ({
        tableName: input.tableName,
        file: files.current[input.id],
        encoding: input.encoding,
        delimiter: input.delimiter,
        headerRow: input.headerRow ?? 1,
        columnMapping: Object.fromEntries(input.requiredColumns.map((column) => [column.name, column.name])),
      })));
      const blob = new Blob([result.csv.buffer as ArrayBuffer], { type: "text/csv" });
      setDownloadUrl(URL.createObjectURL(blob));
      const { csv: _csv, ...previewResult } = result;
      void _csv;
      setPreview(previewResult);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "テスト実行に失敗しました。");
    } finally {
      setPreviewing(false);
      setPhase("");
    }
  }

  async function saveAndPublish() {
    setError(undefined);
    const preparedDraft = prepareDraft(draft, fileStates, instruction, downloadEnabled);
    const validationError = validateDraft(preparedDraft);
    if (validationError) { setError(validationError); return; }
    const selectedSamples = Object.entries(sampleFiles);
    if (selectedSamples.length && !user) { setError("サンプルを追加するにはログインしてください。"); return; }
    if (selectedSamples.length && selectedSamples.length !== preparedDraft.inputs.length) {
      setError("すぐ実行できるように、すべての入力元へサンプルを追加してください。");
      return;
    }
    setSaving(true);
    try {
      let result: ManagedFlow;
      if (selectedSamples.length) {
        const saved = existing ? await updateManagedFlow(existing, preparedDraft, false) : await createManagedFlow(preparedDraft, false);
        setExisting(saved);
        await uploadManagedFlowSamples(saved, sampleFiles);
        result = await setManagedFlowPublished(saved, true);
      } else {
        result = existing ? await updateManagedFlow(existing, preparedDraft, true) : await createManagedFlow(preparedDraft, true);
      }
      const publishedInstruction = preparedDraft.instruction ?? instruction.trim();
      setExisting(result);
      setDraft(preparedDraft);
      setInstruction(publishedInstruction);
      setGeneratedInstruction(publishedInstruction);
      setHasGeneratedSql(true);
      setPublishedSnapshot(editorSnapshot(preparedDraft, publishedInstruction, downloadEnabled));
      setPublishedResult(result);
      setSampleFiles({});
      setCopiedLink(undefined);
    } catch (saveError) {
      const savedFlow = savedFlowFromPublicationError(saveError);
      if (savedFlow) setExisting(savedFlow);
      setError(saveError instanceof Error ? saveError.message : "処理を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  function selectSampleFile(inputId: string, file: File) {
    setError(undefined);
    const validationError = validateSampleFile(inputId, file, sampleFiles);
    if (validationError) { setError(validationError); return; }
    setSampleFiles((current) => ({ ...current, [inputId]: file }));
  }

  function removeSampleFile(inputId: string) {
    setSampleFiles((current) => {
      const next = { ...current };
      delete next[inputId];
      return next;
    });
  }

  async function startLogin() {
    try {
      if (!authConfigured) throw new Error("ログイン設定が完了していません。");
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "ログインを開始できませんでした。");
    }
  }

  async function copyFlowUrl(kind: "public" | "edit") {
    if (!existing) return;
    const path = kind === "public" ? publicRunUrl(existing.publicId) : editUrl(existing);
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopiedLink(kind);
  }

  if (loading) return <main className="studio-shell"><div className="loading-row"><span className="spinner" />処理を読み込んでいます</div></main>;
  const canAddMoreFiles = draft.inputs.some((input) => !files.current[input.id]) || draft.inputs.length < 2;
  const hasUnpublishedChanges = Boolean(existing && (existing.status !== "published" || publishedSnapshot !== editorSnapshot(draft, instruction, downloadEnabled)));
  const sampleCount = Object.keys(sampleFiles).length;
  const sampleSetComplete = sampleCount === 0 || sampleCount === draft.inputs.length;
  const hasCompleteSourceSamples = draft.inputs.length > 0 && draft.inputs.every((input) => sourceSamples.some((sample) => sample.inputId === input.id));
  const googleTargets: Array<FlowInput | undefined> = mode === "create" && draft.inputs.length < 2
    ? [...draft.inputs, undefined]
    : draft.inputs.length ? draft.inputs : [undefined];

  return (
    <main className="studio-shell wizard-shell">
      <header className="wizard-heading">
        <div className="wizard-heading-row">
          <h1>{mode === "create" ? "自分の処理を作る" : "作成済み処理を編集"}</h1>
          {existing && <span className={`edit-status${hasUnpublishedChanges ? " pending" : " published"}`}>{hasUnpublishedChanges ? "未公開の変更があります" : "公開中"}</span>}
        </div>
        {existing && (
          <div className="edit-flow-links">
            <a href={publicRunUrl(existing.publicId)} target="_blank" rel="noreferrer">公開ページを開く<ExternalLink size={15} aria-hidden="true" /></a>
            <button type="button" onClick={() => void copyFlowUrl("public")}><Copy size={15} aria-hidden="true" />{copiedLink === "public" ? "公開URLをコピーしました" : "公開URLをコピー"}</button>
            <button type="button" onClick={() => void copyFlowUrl("edit")}><Copy size={15} aria-hidden="true" />{copiedLink === "edit" ? "編集URLをコピーしました" : "編集URLをコピー"}</button>
          </div>
        )}
      </header>

      {activeStep > 1 && (
        <WizardStepper
          activeStep={activeStep}
          canSelect={(step) => step === 1 || step === 2 && canLeaveStepOne() || (step === 3 || step === 4) && Boolean(preview)}
          onSelect={(step) => {
            setError(undefined);
            setActiveStep(step);
          }}
        />
      )}

      <section className="wizard-card">
        {activeStep === 1 && (
          <div className="wizard-panel" role="tabpanel">
            <input
              ref={picker}
              className="visually-hidden"
              type="file"
              accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                event.target.value = "";
                const replacementId = replacingInputId.current;
                replacingInputId.current = undefined;
                if (replacementId && selected[0]) void replaceFile(replacementId, selected[0]);
                else void addFiles(selected);
              }}
            />
            {hasCompleteSourceSamples && (
              <section className="editor-source-samples" aria-label="この処理のサンプル">
                <div>
                  <FlaskConical size={20} aria-hidden="true" />
                  <span><strong>この処理にはサンプルがあります</strong><small>入力ファイルとして読み込み、すぐに結果を確認できます。</small></span>
                </div>
                <button type="button" className="button secondary" disabled={selectingSourceSamples} onClick={() => void selectExistingSamples()}>
                  {selectingSourceSamples ? "読み込んでいます..." : "サンプルを選択"}
                </button>
              </section>
            )}
            <div className="editor-source-tabs" role="tablist" aria-label="入力元">
              <button type="button" role="tab" aria-selected={sourceTab === "file"} className={sourceTab === "file" ? "active" : ""} onClick={() => setSourceTab("file")}>ファイル</button>
              <button type="button" role="tab" aria-selected={sourceTab === "google"} className={sourceTab === "google" ? "active" : ""} onClick={() => setSourceTab("google")}>Googleスプレッドシート</button>
            </div>
            {sourceTab === "google" && (
              <div className="editor-google-source-list">
                {googleTargets.map((input) => {
                  const formKey = input?.id ?? "new";
                  const url = googleUrls[formKey] ?? "";
                  return (
                    <section className="editor-google-source" aria-label={input ? `${input.label}のGoogleスプレッドシート` : "Googleスプレッドシート"} key={formKey}>
                      <h3>{input?.label ?? "Googleスプレッドシートを追加"}</h3>
                      <label className="field"><span>スプレッドシートURL</span><input type="url" value={url} placeholder="https://docs.google.com/spreadsheets/d/..." onChange={(event) => setGoogleUrls((current) => ({ ...current, [formKey]: event.target.value }))} /></label>
                      <p>リンクを知っている全員が閲覧できる共有設定にしてください。読み込み後、シート・範囲を下の設定で選択できます。</p>
                      <button type="button" className="button primary" disabled={Boolean(googleLoadingId) || !url.trim()} onClick={() => void loadGoogleSheet(input)}>{googleLoadingId === formKey ? "読み込んでいます..." : input && files.current[input.id] ? "データを変更" : "データを読み込む"}</button>
                    </section>
                  );
                })}
              </div>
            )}
            {sourceTab === "file" && (
              mode === "edit" ? (
                <div className="edit-input-file-list">
                  {draft.inputs.map((input) => {
                    const state = fileStates[input.id];
                    return (
                      <article className="edit-input-file" key={input.id}>
                        <header><h3>{input.label}</h3><span>必要な列：{input.requiredColumns.map((column) => column.name).join("、")}</span></header>
                        <div
                          className={`csv-dropzone compact edit-input-dropzone${editDragInputId === input.id ? " dragging" : ""}`}
                          onDragEnter={(event) => { event.preventDefault(); setEditDragInputId(input.id); }}
                          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditDragInputId(undefined); }}
                          onDrop={(event) => { event.preventDefault(); setEditDragInputId(undefined); const file = event.dataTransfer.files[0]; if (file) void replaceFile(input.id, file); }}
                        >
                          <div><strong>CSV・Excel・JSONをここにドロップ</strong><span>または</span></div>
                          <button type="button" className="button secondary" onClick={() => openPicker(input.id)}>ファイルを選択</button>
                        </div>
                        {state?.status === "analyzing" && <p className="edit-input-file-status"><span className="spinner small" />{state.name}を解析しています</p>}
                        {state?.status === "ready" && state.analysis && <p className="edit-input-file-status success-text">{state.name}　確認済み・{state.analysis.rowCount.toLocaleString()}行</p>}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div
                  className={`csv-dropzone compact${dragging ? " dragging" : ""}${!canAddMoreFiles ? " full" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); if (canAddMoreFiles) setDragging(true); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = canAddMoreFiles ? "copy" : "none"; }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                  onDrop={(event) => { event.preventDefault(); setDragging(false); if (canAddMoreFiles) void addFiles(Array.from(event.dataTransfer.files)); }}
                >
                  <div>
                    <strong>{canAddMoreFiles ? "CSV・Excel・JSONをここにドロップ" : "必要な入力データを選択済みです"}</strong>
                    {canAddMoreFiles && <span>または</span>}
                  </div>
                  <button type="button" className="button secondary" disabled={!canAddMoreFiles} onClick={() => openPicker()}>ファイルを選択</button>
                </div>
              )
            )}

            {draft.inputs.some((input) => Boolean(fileStates[input.id])) && (
              <div className="added-files">
                <h3>入力データの設定</h3>
                <div className="editor-file-list">
                  {draft.inputs.map((input) => {
                    const state = fileStates[input.id];
                    if (!state) return null;
                    const isCsv = !state.sourceKind || state.sourceKind === "csv";
                    const hasHeaderRow = state.sourceKind !== "json";
                    const hasRange = state.sourceKind === "excel" || state.sourceKind === "google";
                    return (
                      <article className="editor-file-card" key={input.id}>
                        <div className="file-card-main">
                          <div className="csv-file-icon" aria-hidden="true"><FileSpreadsheet size={25} /></div>
                          <div className="file-card-info">
                            <h4>{state.name}</h4>
                            {state.status === "analyzing" ? (
                              <p className="file-meta"><span className="spinner small" />入力データを解析しています</p>
                            ) : state.analysis ? (
                              <p className="file-meta"><span className="read-status">読み込み完了</span>・ {formatFileSize(state.size)} ・ {state.analysis.rowCount.toLocaleString()}行 ・ {state.analysis.headers.length.toLocaleString()}列</p>
                            ) : null}
                          </div>
                          <div className="file-card-actions">
                            {mode === "create" && <button type="button" className="delete-file" aria-label={`${state.name}を削除`} onClick={() => removeFile(input.id)}><Trash2 size={19} aria-hidden="true" /></button>}
                          </div>
                        </div>
                        {state.error && <div className="inline-file-error">{state.error}</div>}

                        <div className="file-details">
                          {state.options && state.options.length > 0 && (
                            <label className="field structured-source-select">
                              <span>{state.sourceKind === "json" ? "JSONの読み込み対象" : "シート"}</span>
                              <select value={state.selectedOption} onChange={(event) => void selectStructuredOption(input.id, event.target.value)}>
                                {state.options.map((option) => <option key={option}>{option}</option>)}
                              </select>
                            </label>
                          )}
                          {hasRange && (
                            <label className="field structured-source-select">
                              <span>範囲（任意）</span>
                              <input
                                value={state.range ?? ""}
                                placeholder="例：A1:D100"
                                onChange={(event) => setFileStates((current) => ({ ...current, [input.id]: { ...current[input.id], range: event.target.value } }))}
                                onBlur={() => { if (state.selectedOption) void selectStructuredOption(input.id, state.selectedOption, fileStates[input.id]?.range ?? ""); }}
                              />
                            </label>
                          )}
                          <div className="detail-grid">
                            <label className="field"><span>識別名</span><input required value={input.label} onChange={(event) => updateInput(input.id, { label: event.target.value })} onBlur={() => { if (!input.label.trim()) updateInput(input.id, { label: state.name.replace(/\.(csv|xlsx|json)$/i, "") }); }} /></label>
                            <label className="field"><span>文字コード</span><select value={input.encoding} onChange={(event) => changeEditorEncoding(input, state, event.target.value as CsvEncoding)}>{encodingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                            {isCsv && (
                              <label className="field"><span>区切り文字</span><select value={input.delimiter} onChange={(event) => updateInput(input.id, { delimiter: event.target.value as FlowInput["delimiter"] }, true)}><option value=",">カンマ</option><option value="\t">タブ</option><option value=";">セミコロン</option></select></label>
                            )}
                            {hasHeaderRow && (
                              <label className="field"><span>ヘッダー行</span><input type="number" min={1} max={100} value={input.headerRow ?? 1} onChange={(event) => updateInput(input.id, { headerRow: Math.max(1, Number(event.target.value) || 1) }, true)} /></label>
                            )}
                          </div>
                          {input.requiredColumns.length > 0 && (
                            <div className="inferred-columns">
                              <h5>列のデータ型</h5>
                              <div className="inferred-column-list">
                                {input.requiredColumns.map((column, columnIndex) => (
                                  <label key={`${input.id}-${column.name}`}><span>{column.name}</span><select value={column.type} onChange={(event) => updateColumnType(input.id, columnIndex, event.target.value as InputColumn["type"])}>{inputTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}
            <div className="wizard-actions end">
              <div className="next-action">
                {draft.inputs.some((input) => fileStates[input.id] && fileStates[input.id].status !== "ready") && <p>解析エラーのあるCSVを修正または削除してください。</p>}
                <button type="button" className="button primary" disabled={!draft.inputs.length || !canLeaveStepOne()} onClick={goToProcessing}>次へ：処理を作成 <ArrowRight size={17} aria-hidden="true" /></button>
              </div>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="processing-form">
              <label className="field instruction-field"><span>やりたいこと（処理）</span><textarea rows={6} maxLength={4000} placeholder="例：請求CSVと入金CSVを請求番号で照合して、未入金や金額の違いが分かるようにして。" value={instruction} onChange={(event) => { setInstruction(event.target.value); setAiWarnings([]); clearPreview(); }} /></label>
              <div className="schema-overview">
                {draft.inputs.map((input) => (
                  <article key={input.id}>
                    <header><strong>{input.label || fileStates[input.id]?.name || "入力CSV"}</strong><span>{input.requiredColumns.length}列</span></header>
                    <div className="schema-preview">{input.requiredColumns.slice(0, 6).map((column) => <span key={column.name}>{column.name}<small>{column.type}</small></span>)}</div>
                    {input.requiredColumns.length > 6 && <details className="all-columns"><summary>すべての列を確認</summary><div>{input.requiredColumns.map((column) => <span key={column.name}>{column.name}<small>{column.type}</small></span>)}</div></details>}
                    <details className="processing-details">
                      <summary>詳細設定<ChevronDown className="details-chevron" size={17} aria-hidden="true" /></summary>
                      <div className="processing-details-body">
                    <section className="processing-input-settings" key={input.id}>
                      <label className="field processing-identifier"><span>識別名</span><input required value={input.label} maxLength={80} onChange={(event) => updateInput(input.id, { label: event.target.value })} onBlur={() => { if (!input.label.trim()) updateInput(input.id, { label: fileStates[input.id]?.name.replace(/\.csv$/i, "") || input.tableName }); }} /></label>
                      <div className="inferred-columns">
                        <h4>列の型</h4>
                        <div className="inferred-column-list">
                          {input.requiredColumns.map((column, columnIndex) => (
                            <label key={`${input.id}-processing-${column.name}`}><span title={column.name}>{column.name}</span><select aria-label={`${column.name}の型`} value={column.type} onChange={(event) => updateColumnType(input.id, columnIndex, event.target.value as InputColumn["type"])}>{inputTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                          ))}
                        </div>
                      </div>
                    </section>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="wizard-actions between"><button type="button" className="button plain" onClick={() => setActiveStep(1)}>戻る</button><button type="button" className="button primary" disabled={aiGenerating || previewing} onClick={() => void generateAndPreview()}><Sparkles size={18} aria-hidden="true" />{aiGenerating || previewing ? "結果を確認しています..." : "結果を確認"}<ArrowRight size={17} aria-hidden="true" /></button></div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="wizard-panel" role="tabpanel">
            {previewing && <div className="processing-status"><span className="spinner" /><strong>{phase || "処理中"}</strong><button type="button" className="text-button danger" onClick={() => client.current?.cancel()}>キャンセル</button></div>}
            {error && <div className="error-message">{error}</div>}
            {aiWarnings.length > 0 && <div className="warning-message"><strong>AIからの確認事項</strong><ul>{aiWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            {preview && (
              <>
                <div className="result-toolbar"><div><h3>プレビュー</h3><p>{preview.totalRows.toLocaleString()}件を処理しました（{preview.elapsedMs.toLocaleString()}ms）</p></div>{downloadUrl && <a className="button secondary" href={downloadUrl} download={draft.output.fileName || "result.csv"}><Download size={17} aria-hidden="true" />結果をダウンロード</a>}</div>
                <ResultTable result={preview} overflowNote="画面は先頭100件のみ表示しています。" />
              </>
            )}
            {draft.sql && (
              <details className="sql-adjustment">
                <summary><Code2 size={18} aria-hidden="true" />SQLを確認・修正</summary>
                <div className="sql-adjustment-body">
                  <label className="field"><span>DuckDB SQL</span><textarea className="sql-editor" rows={12} spellCheck={false} value={draft.sql} onChange={(event) => { setDraft({ ...draft, sql: event.target.value }); setGeneratedInstruction(instruction.trim()); }} /></label>
                  <p className="field-help">結果が意図と違う場合だけSQLを修正し、再確認してください。</p>
                  <button type="button" className="button secondary" disabled={previewing} onClick={() => void runPreview(draft.sql)}><RefreshCw size={17} aria-hidden="true" />修正したSQLで再確認</button>
                </div>
              </details>
            )}
            <div className="wizard-actions between"><button type="button" className="button plain" disabled={previewing} onClick={() => setActiveStep(2)}>戻る</button><button type="button" className="button primary" disabled={!preview || previewing} onClick={() => { setError(undefined); setActiveStep(4); }}>次へ：公開 <ArrowRight size={17} aria-hidden="true" /></button></div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="publish-form">
              <label className="field"><span>処理名</span><input value={draft.name} maxLength={120} placeholder="例：請求・入金チェック" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="field"><span>説明（任意）</span><textarea rows={3} maxLength={1000} placeholder="この処理でできることを入力" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <fieldset className="publish-categories">
                <legend>カテゴリ（複数選択可）</legend>
                <p>ダッシュボードで処理を探すために、1つ以上選択してください。</p>
                <div>
                  {flowCategories.map((category) => {
                    const selected = draft.categories?.includes(category) ?? false;
                    return (
                      <label key={category} className={selected ? "selected" : ""}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setDraft((current) => ({
                            ...current,
                            categories: selected
                              ? (current.categories ?? []).filter((candidate) => candidate !== category)
                              : [...(current.categories ?? []), category],
                          }))}
                        />
                        {flowCategoryLabels[category]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="publication-control"><input type="checkbox" checked={downloadEnabled} onChange={(event) => setDownloadEnabled(event.target.checked)} /><span><strong>出力ファイルを指定する</strong><small>ファイル名と文字コードを指定します。未指定でも結果はダウンロードできます。</small></span></label>
              {downloadEnabled && <div className="field-grid two-columns output-settings"><label className="field"><span>出力ファイル名</span><input value={draft.output.fileName} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, fileName: event.target.value } })} /></label><label className="field"><span>文字コード</span><select value={draft.output.encoding} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, encoding: event.target.value as FlowDraft["output"]["encoding"] } })}><option value="utf-8">UTF-8</option><option value="utf-8-bom">UTF-8 BOM</option><option value="shift_jis">Shift-JIS</option><option value="cp932">Windows-31J／CP932</option></select></label></div>}
              <section className="publish-samples" aria-labelledby="publish-samples-title">
                <div className="publish-samples-heading">
                  <div><h2 id="publish-samples-title">すぐ試せるサンプル</h2><p>公開ページで、データ選択なしですぐ実行できるサンプルを追加できます。</p></div>
                  {user && <span>{displayName}として追加</span>}
                </div>
                {!user ? (
                  <div className="publish-login-note">
                    <div><strong>サンプルの追加にはログインが必要です</strong><p>サンプルを追加しない場合は、ログインせずに公開できます。</p></div>
                    <button type="button" className="button secondary" onClick={() => void startLogin()}><LogIn size={17} aria-hidden="true" />Googleでログイン</button>
                  </div>
                ) : (
                  <div className="publish-sample-list">
                    {draft.inputs.map((input) => {
                      const sample = sampleFiles[input.id];
                      const testFile = files.current[input.id];
                      return (
                        <article className="publish-sample-row" key={input.id}>
                          <div><strong>{input.label}</strong><span>CSV・Excel・JSON、5MB以下</span></div>
                          {sample ? (
                            <div className="publish-sample-selected">
                              <span>{sample.name}・{formatFileSize(sample.size)}</span>
                              <button type="button" aria-label={`${input.label}のサンプルを削除`} onClick={() => removeSampleFile(input.id)}><Trash2 size={17} aria-hidden="true" /></button>
                            </div>
                          ) : (
                            <div className="publish-sample-actions">
                              {testFile && <button type="button" onClick={() => selectSampleFile(input.id, testFile)}>テスト用CSVを使う</button>}
                              <label><UploadCloud size={17} aria-hidden="true" /><span>ファイルを選択</span><input type="file" accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) selectSampleFile(input.id, file); }} /></label>
                            </div>
                          )}
                        </article>
                      );
                    })}
                    <p className={`publish-sample-limit${sampleSetComplete ? "" : " warning"}`}>
                      1ファイル5MB・合計10MBまで。サンプルを追加する場合はすべての入力元に指定してください。
                    </p>
                  </div>
                )}
              </section>
            </div>
            {error && <div className="error-message">{error}</div>}
            {publishedResult && (
              <div className="public-url-result">
                <strong><Link2 size={19} aria-hidden="true" />公開しました</strong>
                <div className="public-url-copy"><input readOnly value={new URL(publicRunUrl(publishedResult.publicId), window.location.origin).toString()} aria-label="公開URL" /><button type="button" className="button secondary" onClick={() => void copyFlowUrl("public")}><Copy size={17} aria-hidden="true" />{copiedLink === "public" ? "コピーしました" : "コピー"}</button></div>
                <div className="published-links"><a href={publicRunUrl(publishedResult.publicId)} target="_blank" rel="noreferrer">公開ページを開く<ExternalLink size={16} aria-hidden="true" /></a><a href={editUrl(publishedResult)}>編集用URLを開く<ExternalLink size={16} aria-hidden="true" /></a></div>
              </div>
            )}
            <div className="wizard-actions between"><button type="button" className="button plain" onClick={() => setActiveStep(3)}>戻る</button><button type="button" className="button primary" disabled={saving || !sampleSetComplete || Boolean(existing && !hasUnpublishedChanges && sampleCount === 0)} onClick={() => void saveAndPublish()}><Link2 size={18} aria-hidden="true" />{saving ? "公開しています..." : existing ? "変更を公開" : "公開URLを発行"}</button></div>
          </div>
        )}
      </section>
      {generationConfirmation && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="generation-confirmation-title">
            <h2 id="generation-confirmation-title">{generationConfirmation === "initial" ? "AIでSQL生成します。よろしいですか？" : "SQLを再生成しますか？"}</h2>
            {generationConfirmation === "regenerate" && <p>現在のSQLは上書きされます。</p>}
            <div className="confirmation-actions">
              <button type="button" className="button plain" onClick={() => setGenerationConfirmation(undefined)}>キャンセル</button>
              <button type="button" className="button primary" autoFocus onClick={() => void generateAndPreview(true)}>{generationConfirmation === "initial" ? "生成する" : "再生成する"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function WizardStepper({ activeStep, canSelect, onSelect }: { activeStep: WizardStep; canSelect: (step: WizardStep) => boolean; onSelect: (step: WizardStep) => void }) {
  const current = wizardSteps.find((step) => step.number === activeStep) ?? wizardSteps[0];
  return (
    <nav className="wizard-stepper" aria-label={`現在のステップ ${current.label}`}>
      <ol>{wizardSteps.map((step) => <li key={step.number} className={step.number === activeStep ? "active" : step.number < activeStep ? "complete" : ""}><button type="button" aria-current={step.number === activeStep ? "step" : undefined} disabled={!canSelect(step.number)} onClick={() => onSelect(step.number)}>{step.label}</button></li>)}</ol>
    </nav>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function editorSourceSamples(flow: PublicFlow): EditorSourceSample[] {
  if (flow.samples?.length) {
    return flow.samples.map((sample) => ({ inputId: sample.inputId, fileName: sample.fileName, url: sample.url }));
  }
  const bundled = getBundledSampleFiles(flow.publicId);
  if (!bundled) return [];
  return flow.inputs.flatMap((input) => {
    const sample = bundled[input.tableName];
    return sample ? [{ inputId: input.id, fileName: sample.name, url: sample.url }] : [];
  });
}

async function prepareEditorSample(sample: EditorSourceSample): Promise<{ file: File; converted: boolean }> {
  const response = await fetch(sample.url);
  if (!response.ok) throw new Error(`${sample.fileName}を読み込めませんでした。`);
  const source = new File([await response.arrayBuffer()], sample.fileName, { type: response.headers.get("content-type") ?? "" });
  const extension = sample.fileName.split(".").pop()?.toLowerCase();
  if (extension === "csv") return { file: source, converted: false };
  if (extension === "xlsx") {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile(source);
    const first = sheets[0];
    if (!first) throw new Error(`${sample.fileName}に読み込めるシートがありません。`);
    return { file: await csvFileFromTabularRows(first.data as TabularRows, `${sample.fileName}-${first.sheet}.csv`), converted: true };
  }
  if (extension === "json") {
    const first = jsonTargets(JSON.parse(await source.text()) as unknown)[0];
    if (!first) throw new Error(`${sample.fileName}に表として読み込めるデータがありません。`);
    return { file: await csvFileFromTabularRows(first.rows, `${sample.fileName}.csv`), converted: true };
  }
  throw new Error("サンプルはCSV、Excel（.xlsx）、JSONに対応しています。");
}

async function csvFileFromTabularRows(rows: TabularRows, name: string, encoding: CsvEncoding = "utf-8") {
  const csv = rowsToCsv(rows);
  if (encoding === "shift_jis" || encoding === "cp932") {
    const { default: iconv } = await import("iconv-lite");
    const encoded = iconv.encode(csv, "cp932");
    return new File([new Uint8Array(encoded)], name, { type: "text/csv" });
  }
  const text = encoding === "utf-8-bom" ? `\uFEFF${csv}` : csv;
  return new File([text], name, { type: "text/csv;charset=utf-8" });
}

function isSupportedEditorFile(file: File) {
  return /\.(csv|xlsx|json)$/i.test(file.name);
}

async function prepareEditorFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    return {
      file,
      originalName: file.name,
      originalSize: file.size,
      sourceKind: "csv" as const,
      converted: false,
      selectedOption: undefined,
    };
  }
  if (extension === "xlsx") {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile(file);
    if (!sheets.length) throw new Error(`${file.name}に読み込めるシートがありません。`);
    const collection: EditorSourceCollection = {
      kind: "excel",
      originalName: file.name,
      size: file.size,
      entries: sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data as TabularRows })),
    };
    return {
      file: await csvFileFromTabularRows(collection.entries[0].rows, `${file.name}-${collection.entries[0].name}.csv`),
      originalName: file.name,
      originalSize: file.size,
      sourceKind: "excel" as const,
      converted: true,
      collection,
      selectedOption: collection.entries[0].name,
    };
  }
  if (extension === "json") {
    const targets = jsonTargets(JSON.parse(await file.text()) as unknown);
    if (!targets.length) throw new Error(`${file.name}に表として読み込めるオブジェクト配列がありません。`);
    const collection: EditorSourceCollection = {
      kind: "json",
      originalName: file.name,
      size: file.size,
      entries: targets.map((target) => ({ name: target.path, rows: target.rows })),
    };
    return {
      file: await csvFileFromTabularRows(collection.entries[0].rows, `${file.name}.csv`),
      originalName: file.name,
      originalSize: file.size,
      sourceKind: "json" as const,
      converted: true,
      collection,
      selectedOption: collection.entries[0].name,
    };
  }
  throw new Error("CSV、Excel（.xlsx）、JSONのいずれかを選択してください。");
}

function editorFileState(
  id: string,
  prepared: Awaited<ReturnType<typeof prepareEditorFile>> | {
    file: File;
    originalName: string;
    originalSize: number;
    sourceKind: "google";
    converted: true;
    collection: EditorSourceCollection;
    selectedOption: string;
    range?: string;
  },
): EditorFileState {
  return {
    id,
    name: prepared.originalName,
    size: prepared.originalSize,
    status: "analyzing",
    sourceKind: prepared.sourceKind,
    options: prepared.collection?.entries.map((entry) => entry.name),
    selectedOption: prepared.selectedOption,
    range: "range" in prepared ? prepared.range : undefined,
  };
}

function editorSnapshot(draft: FlowDraft, instruction: string, downloadEnabled: boolean) {
  return JSON.stringify({ draft, instruction, downloadEnabled });
}

function prepareDraft(draft: FlowDraft, fileStates: Record<string, EditorFileState>, instruction: string, downloadEnabled: boolean): FlowDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    instruction: instruction.trim(),
    inputs: draft.inputs.map((input) => ({
      ...input,
      label: input.label.trim() || fileStates[input.id]?.name.replace(/\.csv$/i, "") || input.tableName,
    })),
    output: {
      ...draft.output,
      enabled: downloadEnabled,
      fileName: downloadEnabled ? draft.output.fileName.trim() || "result.csv" : "result.csv",
      encoding: downloadEnabled ? draft.output.encoding : "utf-8",
    },
  };
}

function validatePreviewDraft(draft: FlowDraft): string | undefined {
  if (!draft.inputs.length) return "入力データを1件以上追加してください。";
  if (draft.inputs.length > 2) return "入力データは最大2件まで追加できます。";
  const tableNames = new Set<string>();
  for (const input of draft.inputs) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.tableName)) return "SQL内のテーブル名は半角英字またはアンダースコアで始めてください。";
    if (tableNames.has(input.tableName)) return "SQL内のテーブル名が重複しています。";
    tableNames.add(input.tableName);
    if (!input.requiredColumns.length) return `${input.label || input.tableName}の列名をCSVから取得できません。`;
  }
  const safety = inspectSqlStructure(draft.sql);
  if (!safety.safe) return safety.errors.join(" ");
}

function validateDraft(draft: FlowDraft): string | undefined {
  const previewError = validatePreviewDraft(draft);
  if (previewError) return previewError;
  if (!draft.name.trim()) return "処理名を入力してください。";
  if (!draft.categories?.length) return "カテゴリを1つ以上選択してください。";
  if (!draft.output.fileName.trim().toLowerCase().endsWith(".csv")) return "出力ファイル名は.csvで終わる名前にしてください。";
}
