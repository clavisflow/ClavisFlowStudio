"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Code2, Copy, ExternalLink, EyeOff, FileJson, FileSpreadsheet, FileText, FlaskConical, Globe2, Link2, LoaderCircle, LogIn, RefreshCw, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { DataSourceCard, DataSourcePicker, GoogleSheetModal } from "@/components/data-source-ui";
import { createManagedFlow, deleteManagedFlow, generateFlowSql, loadEditableFlow, loadPublicFlow, normalizeFlowVisibility, publicRunUrl, savedFlowFromPublicationError, setManagedFlowPublished, updateManagedFlow, uploadManagedFlowSamples } from "@/lib/flow-store";
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
import { aiSampleSignature, aiSampleTabularRows, isCurrentAiSample } from "@/lib/ai-edit-samples";
import { applySqlRequiredColumns } from "@/lib/sql-required-columns";

type WizardStep = 1 | 2 | 3;
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
  editToken?: string;
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
  { number: 1, label: "データ選択" },
  { number: 2, label: "処理作成" },
  { number: 3, label: "公開" },
];

function initialDraft(): FlowDraft {
  return {
    name: "",
    description: "",
    visibility: "public",
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
  const [instruction, setInstruction] = useState("");
  const [generatedInstruction, setGeneratedInstruction] = useState<string>();
  const [hasGeneratedSql, setHasGeneratedSql] = useState(false);
  const [generationConfirmation, setGenerationConfirmation] = useState<"initial" | "regenerate">();
  const [managementConfirmation, setManagementConfirmation] = useState<"unpublish" | "delete">();
  const [managementBusy, setManagementBusy] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const [existing, setExisting] = useState<ManagedFlow>();
  const [publishedSnapshot, setPublishedSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string>();
  const [publishedResult, setPublishedResult] = useState<ManagedFlow>();
  const [sampleFiles, setSampleFiles] = useState<Record<string, File>>({});
  const [sourceSamples, setSourceSamples] = useState<EditorSourceSample[]>([]);
  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleModalUrl, setGoogleModalUrl] = useState("");
  const [googleModalLoading, setGoogleModalLoading] = useState(false);
  const [selectingSourceSamples, setSelectingSourceSamples] = useState(false);
  const [selectingAiSamples, setSelectingAiSamples] = useState(false);
  const [preview, setPreview] = useState<PreviewResult>();
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const [notice, setNotice] = useState("");
  const files = useRef<Record<string, File>>({});
  const sourceCollections = useRef<Record<string, EditorSourceCollection>>({});
  const client = useRef<ProcessingClient | null>(null);
  const { user, configured: authConfigured, signInWithGoogle } = useAuth();

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
        const loadedDraft: FlowDraft = applySqlRequiredColumns({ name: flow.name, description: flow.description, visibility: normalizeFlowVisibility(flow.visibility), categories: flow.categories ?? [], instruction: loadedInstruction, aiSamples: flow.aiSamples, inputs: flow.inputs.map((input) => ({ ...input, headerRow: input.headerRow ?? 1 })), sql: flow.sql, output: flow.output, duckdbVersion: flow.duckdbVersion });
        setExisting(flow);
        setDraft(loadedDraft);
        setInstruction(loadedInstruction);
        setGeneratedInstruction(loadedInstruction);
        setHasGeneratedSql(true);
        setPublishedSnapshot(editorSnapshot(loadedDraft, loadedInstruction));
        setActiveStep(1);
        if (flow.editSamples?.length) {
          setSourceSamples(flow.editSamples.map((sample) => ({
            inputId: sample.inputId,
            fileName: sample.fileName,
            url: sample.url,
            editToken: flow.editToken,
          })));
        } else if (flow.status === "published") {
          try {
            setSourceSamples(editorSourceSamples(await loadPublicFlow(publicId)));
          } catch {
            setSourceSamples([]);
          }
        } else {
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

  async function addFiles(selected: File[]) {
    setError(undefined);
    const unassignedInputs = draft.inputs.filter((input) => !files.current[input.id]);
    const validFiles = selected.filter(isSupportedEditorFile);
    if (validFiles.length !== selected.length) setError("CSV、Excel（.xlsx）、JSONのいずれかを選択してください。");
    if (!validFiles.length) return;
    const preparedFiles = await Promise.all(validFiles.map(prepareEditorFile));
    const existingAssignments = preparedFiles.slice(0, unassignedInputs.length).map((prepared, index) => ({
      prepared,
      input: unassignedInputs[index],
    }));
    const firstNumber = nextTableNumber();
    const additions = preparedFiles.slice(existingAssignments.length).map((prepared, index) => {
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
    existingAssignments.forEach(({ prepared, input }) => {
      files.current[input.id] = prepared.file;
      if (prepared.collection) sourceCollections.current[input.id] = prepared.collection;
      else delete sourceCollections.current[input.id];
    });

    if (additions.length) {
      setDraft((current) => ({ ...current, inputs: [...current.inputs, ...additions.map(({ input }) => input)] }));
    }
    setFileStates((current) => ({
      ...current,
      ...Object.fromEntries([...existingAssignments, ...additions].map(({ prepared, input }) => [input.id, editorFileState(input.id, prepared)])),
    }));
    clearPreview();
    await Promise.all([
      ...existingAssignments.map(({ prepared, input }) => analyzeFile(prepared.file, prepared.converted ? { ...input, encoding: "utf-8", headerRow: 1 } : input, false)),
      ...additions.map(({ prepared, input }) => analyzeFile(prepared.file, prepared.converted ? { ...input, encoding: "utf-8", headerRow: 1 } : input)),
    ]);
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

  async function loadGoogleSheet() {
    const googleUrl = googleModalUrl.trim();
    setError(undefined);
    setGoogleModalLoading(true);
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
      let targetDefinition = draft.inputs.find((input) => !files.current[input.id]);
      let targetId = targetDefinition?.id;
      if (!targetDefinition) {
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
      files.current[targetId!] = prepared.file;
      setFileStates((current) => ({ ...current, [targetId!]: editorFileState(targetId!, prepared) }));
      clearPreview();
      await analyzeFile(prepared.file, targetDefinition, mode !== "edit");
      setGoogleModalOpen(false);
      setGoogleModalUrl("");
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "スプレッドシートを読み込めませんでした。");
    } finally {
      setGoogleModalLoading(false);
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
      setDraft((current) => applySqlRequiredColumns({
        ...current,
        name: sample.flowName,
        description: sample.description,
        categories: [...sample.categories],
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
    let active = true;
    const params = new URL(window.location.href).searchParams;
    const copyId = params.get("copy");
    const sampleId = params.get("sample");
    if (copyId) {
      loadPublicFlow(copyId)
        .then((flow) => {
          if (!active) return;
          const copiedInstruction = flow.instruction ?? flow.description;
          const copiedDraft: FlowDraft = applySqlRequiredColumns({
            name: `${flow.name}（コピー）`,
            description: flow.description,
            visibility: "unlisted",
            categories: flow.categories ?? [],
            instruction: copiedInstruction,
            inputs: flow.inputs.map((input) => ({ ...input, requiredColumns: input.requiredColumns.map((column) => ({ ...column })) })),
            sql: flow.sql,
            output: { ...flow.output },
            duckdbVersion: flow.duckdbVersion,
          });
          setDraft(copiedDraft);
          setInstruction(copiedInstruction);
          setGeneratedInstruction(copiedInstruction);
          setHasGeneratedSql(true);
          setSourceSamples(editorSourceSamples(flow));
        })
        .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "コピー元の処理を読み込めませんでした。"); })
        .finally(() => { if (active) setLoading(false); });
    } else if (sampleId) {
      void startSample(sampleId).finally(() => { if (active) setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => { active = false; };
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

  async function selectAiSamples() {
    const aiSamples = draft.aiSamples;
    if (!aiSamples || !isCurrentAiSample(draft)) {
      setError("現在の処理定義に対応するAIサンプルがありません。処理を再生成してください。");
      return;
    }
    setError(undefined);
    setSelectingAiSamples(true);
    clearPreview();
    try {
      const prepared = await Promise.all(draft.inputs.map(async (input) => {
        const rows = aiSampleTabularRows(aiSamples, input);
        return {
          input,
          file: await csvFileFromTabularRows(rows, `AIサンプル-${input.label}.csv`, "utf-8"),
        };
      }));
      for (const { input, file } of prepared) {
        files.current[input.id] = file;
        delete sourceCollections.current[input.id];
        setFileStates((current) => ({
          ...current,
          [input.id]: {
            id: input.id,
            name: file.name,
            size: file.size,
            status: "analyzing",
            sourceKind: "csv",
          },
        }));
      }
      await Promise.all(prepared.map(({ input, file }) => analyzeFile(file, { ...input, encoding: "utf-8", headerRow: 1 }, false)));
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "AIサンプルを読み込めませんでした。");
    } finally {
      setSelectingAiSamples(false);
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
        setDraft((current) => applySqlRequiredColumns({
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

  function swapInputFiles(inputId: string, direction: -1 | 1) {
    const populated = draft.inputs.filter((input) => Boolean(files.current[input.id]));
    const index = populated.findIndex((input) => input.id === inputId);
    const source = populated[index];
    const target = populated[index + direction];
    if (!source || !target) return;

    swapEditorEntries(files.current, source.id, target.id);
    swapEditorEntries(sourceCollections.current, source.id, target.id);
    setFileStates((current) => {
      const next = { ...current };
      const sourceState = current[source.id];
      const targetState = current[target.id];
      if (targetState) next[source.id] = { ...targetState, id: source.id };
      else delete next[source.id];
      if (sourceState) next[target.id] = { ...sourceState, id: target.id };
      else delete next[target.id];
      return next;
    });

    const sourceAfterSwap = {
      ...source,
      encoding: target.encoding,
      delimiter: target.delimiter,
      headerRow: target.headerRow,
    };
    const targetAfterSwap = {
      ...target,
      encoding: source.encoding,
      delimiter: source.delimiter,
      headerRow: source.headerRow,
    };
    setDraft((current) => ({
      ...current,
      inputs: current.inputs.map((input) => input.id === source.id ? sourceAfterSwap : input.id === target.id ? targetAfterSwap : input),
    }));
    clearPreview();
    const sourceFile = files.current[source.id];
    const targetFile = files.current[target.id];
    if (sourceFile) void analyzeFile(sourceFile, sourceAfterSwap, false);
    if (targetFile) void analyzeFile(targetFile, targetAfterSwap, false);
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
      let draftForPreview = draft;
      if (needsGeneration) {
        const generated = await generateFlowSql(trimmedInstruction, draft.inputs);
        sql = generated.sql;
        setAiWarnings(generated.samples
          ? generated.warnings
          : [...generated.warnings, "編集用AIサンプルを生成できなかったため、SQLだけを使用します。"]);
        draftForPreview = applySqlRequiredColumns({
          ...draft,
          sql,
          aiSamples: generated.samples ? {
            generatedAt: new Date().toISOString(),
            definitionSignature: aiSampleSignature(sql, draft.inputs),
            inputs: generated.samples,
          } : undefined,
        });
        setDraft(draftForPreview);
        setGeneratedInstruction(trimmedInstruction);
        setHasGeneratedSql(true);
      }
      await runPreview(sql, draftForPreview);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "SQLを生成できませんでした。");
    } finally {
      setAiGenerating(false);
    }
  }

  async function runPreview(sqlOverride = draft.sql, baseDraft = draft) {
    setError(undefined);
    const draftWithRequiredColumns = applySqlRequiredColumns({ ...baseDraft, sql: sqlOverride });
    const preparedDraft = prepareDraft(draftWithRequiredColumns, fileStates, instruction);
    setDraft(draftWithRequiredColumns);
    const validationError = validatePreviewDraft(preparedDraft);
    if (validationError) { setError(validationError); return; }
    const missingFile = draftWithRequiredColumns.inputs.find((input) => !files.current[input.id]);
    if (missingFile) { setError("結果を確認するには、Step 1でテスト用CSVを追加してください。"); return; }
    for (const input of preparedDraft.inputs) {
      const headers = fileStates[input.id]?.analysis?.headers ?? [];
      const missingColumns = input.requiredColumns.filter((column) => column.required && !headers.includes(column.name));
      if (missingColumns.length) { setError(`${input.label}に必要な列がありません: ${missingColumns.map((column) => column.name).join("、")}`); return; }
    }
    if (!client.current) return;
    clearPreview();
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
        columnMapping: Object.fromEntries(input.requiredColumns.filter((column) => column.required).map((column) => [column.name, column.name])),
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

  async function savePreviewExcel() {
    if (!preview) return;
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const rows = [
      preview.columns,
      ...preview.rows.map((row) => preview.columns.map((column) => row[column])),
    ];
    await writeExcelFile(rows).toFile(withExtension(draft.output.fileName || "result.csv", ".xlsx"));
  }

  function savePreviewJson() {
    if (!preview) return;
    downloadBlob(
      new Blob([JSON.stringify(preview.rows, null, 2)], { type: "application/json" }),
      withExtension(draft.output.fileName || "result.csv", ".json"),
    );
  }

  async function copyPreviewResult() {
    if (!preview) return;
    const tsv = [
      preview.columns.join("\t"),
      ...preview.rows.map((row) => preview.columns.map((column) => String(row[column] ?? "").replaceAll("\t", " ")).join("\t")),
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

  async function saveAndPublish() {
    setError(undefined);
    const preparedDraft = prepareDraft(draft, fileStates, instruction);
    const validationError = validateDraft(preparedDraft);
    if (validationError) { setError(validationError); return; }
    const selectedSamples = Object.entries(sampleFiles);
    if (normalizeFlowVisibility(preparedDraft.visibility) === "unlisted" && !user) {
      setError("限定公開にするにはログインしてください。");
      return;
    }
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
      setPublishedSnapshot(editorSnapshot(preparedDraft, publishedInstruction));
      setPublishedResult(result);
      setSampleFiles({});
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

  async function selectAiSampleFile(input: FlowInput) {
    const aiSamples = draft.aiSamples;
    if (!aiSamples || !isCurrentAiSample(draft)) {
      setError("現在の処理定義に対応するAIサンプルがありません。処理を再生成してください。");
      return;
    }
    try {
      const rows = aiSampleTabularRows(aiSamples, input);
      const file = await csvFileFromTabularRows(rows, `AIサンプル-${input.label}.csv`, "utf-8");
      selectSampleFile(input.id, file);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "AIサンプルを準備できませんでした。");
    }
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

  async function confirmManagementAction() {
    if (!existing || !managementConfirmation) return;
    setManagementBusy(true);
    setError(undefined);
    try {
      if (managementConfirmation === "unpublish") {
        const updated = await setManagedFlowPublished(existing, false);
        setExisting(updated);
        setPublishedResult(undefined);
        setManagementConfirmation(undefined);
        return;
      }
      await deleteManagedFlow(existing);
      window.location.assign("/");
    } catch (managementError) {
      setError(managementError instanceof Error ? managementError.message : managementConfirmation === "unpublish" ? "公開を停止できませんでした。" : "処理を削除できませんでした。");
      setManagementConfirmation(undefined);
    } finally {
      setManagementBusy(false);
    }
  }

  if (loading) return <main className="studio-shell"><div className="loading-row"><span className="spinner" />{mode === "create" ? "作成画面を準備しています" : "処理を読み込んでいます"}</div></main>;
  const hasUnpublishedChanges = Boolean(existing && (existing.status !== "published" || publishedSnapshot !== editorSnapshot(draft, instruction)));
  const editorStatus = existing?.status !== "published"
    ? { className: "unpublished", label: "公開停止中" }
    : hasUnpublishedChanges
      ? { className: "pending", label: "未公開の変更があります" }
      : undefined;
  const selectedVisibility = normalizeFlowVisibility(draft.visibility);
  const currentVisibility = existing ? normalizeFlowVisibility(existing.visibility) : selectedVisibility;
  const sampleCount = Object.keys(sampleFiles).length;
  const sampleSetComplete = sampleCount === 0 || sampleCount === draft.inputs.length;
  const hasCompleteSourceSamples = draft.inputs.length > 0 && draft.inputs.every((input) => sourceSamples.some((sample) => sample.inputId === input.id));
  const configuredInputs = draft.inputs.filter((input) => Boolean(files.current[input.id]));
  const hasCurrentAiSample = isCurrentAiSample(draft);

  return (
    <main className="studio-shell wizard-shell">
      <header className="runner-hero editor-hero">
        <div>
          <p className="runner-eyebrow">{mode === "create" ? "処理を作成" : "処理を編集"}</p>
          <h1>{mode === "create" ? "自分の処理を作る" : draft.name || "作成済み処理を編集"}</h1>
        </div>
        {existing && (
          <div className="runner-hero-side editor-hero-side">
            <div className="editor-status-actions">
              {editorStatus && <span className={`flow-state-badge ${editorStatus.className}`}>{editorStatus.label}</span>}
              {existing.status === "published" && (
                <span className={`flow-visibility-badge ${currentVisibility}`}>
                  {currentVisibility === "unlisted" ? <Link2 size={15} aria-hidden="true" /> : <Globe2 size={15} aria-hidden="true" />}
                  {currentVisibility === "unlisted" ? "限定公開" : "一般公開"}
                </span>
              )}
              {existing.status === "published" && (
                <button type="button" disabled={managementBusy} onClick={() => setManagementConfirmation("unpublish")}>
                  <EyeOff size={16} aria-hidden="true" />公開を停止
                </button>
              )}
              <button type="button" className="delete" disabled={managementBusy} onClick={() => setManagementConfirmation("delete")}>
                <Trash2 size={16} aria-hidden="true" />完全に削除
              </button>
            </div>
            <dl className="runner-title-meta">
              <div><dt>公開ID</dt><dd>{existing.publicId}</dd></div>
              <div><dt>バージョン</dt><dd>{existing.version}</dd></div>
              <div><dt>更新日</dt><dd>{formatUpdatedAt(existing.updatedAt)}</dd></div>
              <div><dt>更新者</dt><dd>{existing.updatedBy ?? "---"}</dd></div>
            </dl>
          </div>
        )}
      </header>

      <WizardStepper
        activeStep={activeStep}
        canSelect={(step) => step === 1 || step === 2 && canLeaveStepOne() || step === 3 && Boolean(preview)}
        onSelect={(step) => {
          setError(undefined);
          setActiveStep(step);
        }}
      />

      <section className="wizard-card">
        {activeStep === 1 && (
          <div className="wizard-panel" role="tabpanel">
            {draft.aiSamples && (
              <section className={`editor-ai-samples${hasCurrentAiSample ? "" : " stale"}`} aria-label="編集用AIサンプル">
                <div>
                  <Sparkles size={20} aria-hidden="true" />
                  <span>
                    <strong>{hasCurrentAiSample ? "編集用AIサンプルがあります" : "AIサンプルの再生成が必要です"}</strong>
                    <small>{hasCurrentAiSample ? "処理作成時に生成した非公開データです。公開ページには表示されません。" : "入力列またはSQLが変更されています。STEP 2で処理を再生成してください。"}</small>
                  </span>
                </div>
                <button type="button" className="button secondary" aria-busy={selectingAiSamples} disabled={!hasCurrentAiSample || selectingAiSamples} onClick={() => void selectAiSamples()}>
                  {selectingAiSamples && <LoaderCircle className="spin-icon" size={18} aria-hidden="true" />}
                  {selectingAiSamples ? "読み込んでいます..." : "AIサンプルを読み込む"}
                </button>
              </section>
            )}
            {hasCompleteSourceSamples && (
              <section className="editor-source-samples" aria-label="この処理のサンプル">
                <div>
                  <FlaskConical size={20} aria-hidden="true" />
                  <span><strong>公開サンプルがあります</strong><small>公開ページでも利用できる登録済みサンプルです。</small></span>
                </div>
                <button type="button" className="button secondary" aria-busy={selectingSourceSamples} disabled={selectingSourceSamples} onClick={() => void selectExistingSamples()}>
                  {selectingSourceSamples && <LoaderCircle className="spin-icon" size={18} aria-hidden="true" />}
                  {selectingSourceSamples ? "読み込んでいます..." : "公開サンプルを読み込む"}
                </button>
              </section>
            )}
            <DataSourcePicker
              dragging={dragging}
              onDraggingChange={setDragging}
              onFiles={(selected) => void addFiles(selected)}
              onGoogle={() => setGoogleModalOpen(true)}
            />

            {draft.inputs.length > 0 && (
              <div className="data-source-list">
                  {draft.inputs.map((input) => {
                    const state = fileStates[input.id];
                    if (!state) {
                      return (
                        <DataSourceCard
                          key={input.id}
                          index={0}
                          total={1}
                          sourceName={input.label || "入力データ"}
                          resourceName="ファイル未選択"
                          kindLabel="未選択"
                          identifier={input.tableName}
                          onMove={(direction) => swapInputFiles(input.id, direction)}
                          onDelete={() => removeFile(input.id)}
                        >
                          <label className="field"><span>データソース名</span><input required value={input.label} onChange={(event) => updateInput(input.id, { label: event.target.value })} /></label>
                          <label className="field"><span>文字コード</span><select value={input.encoding} onChange={(event) => updateInput(input.id, { encoding: event.target.value as CsvEncoding })}>{encodingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                        </DataSourceCard>
                      );
                    }
                    const isCsv = !state.sourceKind || state.sourceKind === "csv";
                    const hasHeaderRow = state.sourceKind !== "json";
                    const hasRange = state.sourceKind === "excel" || state.sourceKind === "google";
                    const sourceIndex = configuredInputs.findIndex((candidate) => candidate.id === input.id);
                    return (
                      <DataSourceCard
                        key={input.id}
                        index={sourceIndex}
                        total={configuredInputs.length}
                        sourceName={input.label}
                        resourceName={state.name}
                        kindLabel={editorSourceKindLabel(state.sourceKind)}
                        identifier={input.tableName}
                        rowCount={state.analysis?.rowCount}
                        columnCount={state.analysis?.headers.length}
                        busy={state.status === "analyzing"}
                        error={state.error}
                        onMove={(direction) => swapInputFiles(input.id, direction)}
                        onDelete={() => removeFile(input.id)}
                        afterSettings={input.requiredColumns.length > 0 ? (
                          <div className="editor-column-tags">
                            <span>読み込んだ列</span>
                            <div>
                              {input.requiredColumns.map((column) => <b key={`${input.id}-${column.name}`}>{column.name}</b>)}
                            </div>
                          </div>
                        ) : undefined}
                      >
                          {state.options && state.options.length > 0 && (
                            <label className="field">
                              <span>{state.sourceKind === "json" ? "JSONの読み込み対象" : "シート"}</span>
                              <select value={state.selectedOption} onChange={(event) => void selectStructuredOption(input.id, event.target.value)}>
                                {state.options.map((option) => <option key={option}>{option}</option>)}
                              </select>
                            </label>
                          )}
                          {hasRange && (
                            <label className="field">
                              <span>範囲（任意）</span>
                              <input
                                value={state.range ?? ""}
                                placeholder="例：A1:D100"
                                onChange={(event) => setFileStates((current) => ({ ...current, [input.id]: { ...current[input.id], range: event.target.value } }))}
                                onBlur={() => { if (state.selectedOption) void selectStructuredOption(input.id, state.selectedOption, fileStates[input.id]?.range ?? ""); }}
                              />
                            </label>
                          )}
                          <label className="field"><span>データソース名</span><input required value={input.label} onChange={(event) => updateInput(input.id, { label: event.target.value })} onBlur={() => { if (!input.label.trim()) updateInput(input.id, { label: state.name.replace(/\.(csv|xlsx|json)$/i, "") }); }} /></label>
                          <label className="field"><span>文字コード</span><select value={input.encoding} onChange={(event) => changeEditorEncoding(input, state, event.target.value as CsvEncoding)}>{encodingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                          {isCsv && (
                            <label className="field"><span>区切り文字</span><select value={input.delimiter} onChange={(event) => updateInput(input.id, { delimiter: event.target.value as FlowInput["delimiter"] }, true)}><option value=",">カンマ</option><option value="\t">タブ</option><option value=";">セミコロン</option></select></label>
                          )}
                          {hasHeaderRow && (
                            <label className="field"><span>ヘッダー行</span><input type="number" min={1} max={100} value={input.headerRow ?? 1} onChange={(event) => updateInput(input.id, { headerRow: Math.max(1, Number(event.target.value) || 1) }, true)} /></label>
                          )}
                      </DataSourceCard>
                    );
                  })}
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
            <section className="processing-card" aria-labelledby="processing-settings-title">
              <header className="processing-card-heading">
                <h2 id="processing-settings-title">処理内容</h2>
              </header>
              <div className="processing-card-body">
                <label className="field instruction-field"><span>やりたいこと <small>（AIが処理を作成します）</small></span><textarea rows={6} maxLength={4000} placeholder="例：請求CSVと入金CSVを請求番号で照合して、未入金や金額の違いが分かるようにして。" value={instruction} onChange={(event) => { setInstruction(event.target.value); setAiWarnings([]); clearPreview(); }} /></label>
                <div className="processing-source-list">
                {draft.inputs.map((input) => (
                  <article className="processing-source-card" key={input.id}>
                    <header>
                      <div className="processing-source-title">
                        <strong>{input.label || fileStates[input.id]?.name || "入力データ"}</strong>
                        <span>識別名: <code>{input.tableName}</code></span>
                      </div>
                      <span className="processing-source-count">{input.requiredColumns.length}列・{input.requiredColumns.filter((column) => column.required).length}列必須</span>
                    </header>
                    <div className="processing-input-settings">
                      <div className="inferred-columns">
                        <h4>列の設定</h4>
                        <div className="column-definition-captions" aria-hidden="true"><span>列名</span><span>データ型</span><span>必須判定</span></div>
                        <div className="inferred-column-list">
                          {input.requiredColumns.map((column, columnIndex) => (
                            <label key={`${input.id}-processing-${column.name}`}>
                              <span title={column.name}>{column.name}</span>
                              <select aria-label={`${column.name}の型`} value={column.type} onChange={(event) => updateColumnType(input.id, columnIndex, event.target.value as InputColumn["type"])}>{inputTypes.map((type) => <option key={type}>{type}</option>)}</select>
                              <em>{draft.sql ? column.required ? "SQLで使用（必須）" : "SQLでは未使用" : "SQL生成後に必須判定"}</em>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
                </div>
                {draft.sql && (
                  <details className="sql-adjustment">
                    <summary><Code2 size={18} aria-hidden="true" />AIが生成したSQLを確認・修正</summary>
                    <div className="sql-adjustment-body">
                      <label className="field"><span>DuckDB SQL</span><textarea className="sql-editor" rows={12} spellCheck={false} value={draft.sql} onChange={(event) => { setDraft((current) => applySqlRequiredColumns({ ...current, sql: event.target.value })); setGeneratedInstruction(instruction.trim()); clearPreview(); }} /></label>
                      <p className="field-help">結果が意図と違う場合だけSQLを修正し、再確認してください。</p>
                      <button type="button" className="button secondary" aria-busy={previewing && !aiGenerating} disabled={previewing} onClick={() => void runPreview(draft.sql)}>
                        {previewing && !aiGenerating ? <LoaderCircle className="spin-icon" size={18} aria-hidden="true" /> : <RefreshCw size={17} aria-hidden="true" />}
                        {previewing && !aiGenerating ? "再確認しています..." : "修正したSQLで再確認"}
                      </button>
                    </div>
                  </details>
                )}
                <div className="processing-card-actions">
                  <button type="button" className="button primary" aria-busy={aiGenerating} disabled={aiGenerating || previewing} onClick={() => void generateAndPreview()}>
                    {aiGenerating ? <LoaderCircle className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                    {aiGenerating ? "結果を確認しています..." : preview ? "変更を反映して再確認" : "結果を確認"}
                  </button>
                </div>
              </div>
            </section>
            {previewing && <div className="processing-status"><span className="spinner" /><strong>{phase || "処理中"}</strong><button type="button" className="text-button danger" onClick={() => client.current?.cancel()}>キャンセル</button></div>}
            {error && <div className="error-message">{error}</div>}
            {aiWarnings.length > 0 && <div className="warning-message"><strong>AIからの確認事項</strong><ul>{aiWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
            {preview && (
              <section className="result-preview-card" aria-labelledby="result-preview-title">
                <div className="result-toolbar">
                  <h3 id="result-preview-title">結果プレビュー</h3>
                  <p className="result-preview-meta">{preview.totalRows.toLocaleString()}件を処理しました（{preview.elapsedMs.toLocaleString()}ms）</p>
                </div>
                <ResultTable result={preview} overflowNote="画面は先頭100件のみ表示しています。" />
                {downloadUrl && (
                  <div className="result-preview-actions" aria-label="結果を保存">
                    <a className="button secondary" href={downloadUrl} download={withExtension(draft.output.fileName || "result.csv", ".csv")}><FileText size={17} aria-hidden="true" />CSVで保存</a>
                    <button type="button" className="button secondary" onClick={() => void savePreviewExcel()}><FileSpreadsheet size={17} aria-hidden="true" />Excelで保存</button>
                    <button type="button" className="button secondary" onClick={savePreviewJson}><FileJson size={17} aria-hidden="true" />JSONで保存</button>
                    <button type="button" className="button secondary" onClick={() => void copyPreviewResult()}><Copy size={17} aria-hidden="true" />クリップボードにコピー</button>
                  </div>
                )}
              </section>
            )}
            <div className="wizard-actions between">
              <button type="button" className="button plain" disabled={previewing} onClick={() => setActiveStep(1)}>戻る</button>
              <button type="button" className="button primary" disabled={!preview || previewing} onClick={() => { setError(undefined); setActiveStep(3); }}>次へ：公開 <ArrowRight size={17} aria-hidden="true" /></button>
            </div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="publish-form">
              <section className="publish-card" aria-labelledby="publish-information-title">
                <header><h2 id="publish-information-title">公開情報</h2></header>
                <div className="publish-card-body">
                  <label className="field"><span>処理名</span><input value={draft.name} maxLength={120} placeholder="例：請求・入金チェック" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <label className="field"><span>説明（任意）</span><textarea rows={3} maxLength={1000} placeholder="この処理でできることを入力" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                  <fieldset className="publish-categories">
                    <legend>カテゴリ（複数選択可）</legend>
                    <p>処理を分類するために、1つ以上選択してください。</p>
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
                  <fieldset className="publish-visibility">
                    <legend>公開範囲</legend>
                    {user ? (
                      <div className="publish-visibility-options">
                        <label className={selectedVisibility === "public" ? "selected" : ""}>
                          <input type="radio" name="flow-visibility" value="public" checked={selectedVisibility === "public"} onChange={() => setDraft((current) => ({ ...current, visibility: "public" }))} />
                          <span><strong><Globe2 size={18} aria-hidden="true" />一般公開</strong><small>ポータルや検索結果に表示します。</small></span>
                        </label>
                        <label className={selectedVisibility === "unlisted" ? "selected" : ""}>
                          <input type="radio" name="flow-visibility" value="unlisted" checked={selectedVisibility === "unlisted"} onChange={() => setDraft((current) => ({ ...current, visibility: "unlisted" }))} />
                          <span><strong><Link2 size={18} aria-hidden="true" />限定公開</strong><small>ポータルには表示せず、URLを知っている人だけ実行できます。</small></span>
                        </label>
                      </div>
                    ) : (
                      <div className="publish-visibility-login">
                        <div>
                          <strong>{selectedVisibility === "unlisted" ? "限定公開" : "一般公開"}</strong>
                          <p>{selectedVisibility === "unlisted" ? "限定公開での公開にはログインが必要です。" : "ログインすると、ポータルに表示しない限定公開を選択できます。"}</p>
                        </div>
                        <button type="button" className="button secondary" onClick={() => void startLogin()}><LogIn size={17} aria-hidden="true" />Googleでログイン</button>
                      </div>
                    )}
                  </fieldset>
                </div>
              </section>
              <section className="publish-card publish-samples" aria-labelledby="publish-samples-title">
                <div className="publish-samples-heading">
                  <div>
                    <div className="publish-samples-title-row">
                      <h2 id="publish-samples-title">サンプルデータ</h2>
                      <p className="publish-samples-warning">
                        <AlertTriangle size={17} aria-hidden="true" />
                        サンプルデータに個人情報・機密情報・実在する顧客データを含めないでください。
                      </p>
                    </div>
                    <p>編集時の結果確認や、公開ページの「サンプルですぐ実行」に使用します。</p>
                  </div>
                </div>
                <div className="publish-card-body">
                  {!user ? (
                    <div className="publish-login-note">
                      <div><strong>サンプルの追加にはログインが必要です</strong><p>公開範囲にあるログインボタンからログインできます。サンプルを追加しない場合は、ログインせずに公開できます。</p></div>
                    </div>
                  ) : (
                    <div className="publish-sample-list">
                      {draft.inputs.map((input) => {
                        const sample = sampleFiles[input.id];
                        const testFile = files.current[input.id];
                        const testFileIsAiSample = testFile?.name.startsWith("AIサンプル-") ?? false;
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
                                {hasCurrentAiSample && <button type="button" onClick={() => void selectAiSampleFile(input)}><Sparkles size={17} aria-hidden="true" />AIサンプルを使う</button>}
                                {testFile && !testFileIsAiSample && <button type="button" onClick={() => selectSampleFile(input.id, testFile)}>現在のテストデータを使う</button>}
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
                </div>
              </section>
            </div>
            {error && <div className="error-message">{error}</div>}
            {publishedResult && (
              <div className="public-url-result">
                <strong><Link2 size={19} aria-hidden="true" />公開しました</strong>
                <a className="button secondary public-confirm-link" href={publicRunUrl(publishedResult.publicId)} target="_blank" rel="noreferrer">公開ページを確認<ExternalLink size={17} aria-hidden="true" /></a>
              </div>
            )}
            <div className="wizard-actions between"><button type="button" className="button plain" disabled={saving} onClick={() => setActiveStep(2)}>戻る</button><button type="button" className="button primary" aria-busy={saving} disabled={saving || !sampleSetComplete || Boolean(existing && !hasUnpublishedChanges && sampleCount === 0)} onClick={() => void saveAndPublish()}>{saving ? <LoaderCircle className="spin-icon" size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}{saving ? "公開しています..." : existing ? "変更を公開" : "公開URLを発行"}</button></div>
          </div>
        )}
      </section>
      <GoogleSheetModal
        open={googleModalOpen}
        url={googleModalUrl}
        loading={googleModalLoading}
        onUrlChange={setGoogleModalUrl}
        onClose={() => setGoogleModalOpen(false)}
        onSubmit={() => void loadGoogleSheet()}
      />
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
      {managementConfirmation && existing && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="management-confirmation-title">
            <h2 id="management-confirmation-title">
              {managementConfirmation === "unpublish" ? "公開を停止しますか？" : "この処理を完全に削除しますか？"}
            </h2>
            <p>
              {managementConfirmation === "unpublish"
                ? "公開ページから実行できなくなります。処理定義とサンプルデータは残り、後から再公開できます。"
                : "公開ページ、処理定義、サンプルデータを削除します。この操作は元に戻せません。"}
            </p>
            <div className="confirmation-actions">
              <button type="button" className="button plain" disabled={managementBusy} onClick={() => setManagementConfirmation(undefined)}>キャンセル</button>
              <button
                type="button"
                className={`button ${managementConfirmation === "delete" ? "danger-button" : "primary"}`}
                aria-busy={managementBusy}
                disabled={managementBusy}
                autoFocus
                onClick={() => void confirmManagementAction()}
              >
                {managementBusy && <LoaderCircle className="spin-icon" size={18} aria-hidden="true" />}
                {managementBusy
                  ? managementConfirmation === "unpublish" ? "停止しています..." : "削除しています..."
                  : managementConfirmation === "unpublish" ? "公開を停止する" : "完全に削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && <div className="portal-toast" role="status">{notice}</div>}
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

function formatUpdatedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function editorSourceKindLabel(kind?: EditorFileState["sourceKind"]) {
  if (kind === "excel") return "Excel";
  if (kind === "json") return "JSON";
  if (kind === "google") return "Googleスプレッドシート";
  return "CSV";
}

function swapEditorEntries<T>(record: Record<string, T>, firstId: string, secondId: string) {
  const first = record[firstId];
  const second = record[secondId];
  if (second === undefined) delete record[firstId];
  else record[firstId] = second;
  if (first === undefined) delete record[secondId];
  else record[secondId] = first;
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
  const response = await fetch(sample.url, sample.editToken ? { headers: { "x-edit-token": sample.editToken } } : undefined);
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

function editorSnapshot(draft: FlowDraft, instruction: string) {
  return JSON.stringify({ draft, instruction });
}

function prepareDraft(draft: FlowDraft, fileStates: Record<string, EditorFileState>, instruction: string): FlowDraft {
  const name = draft.name.trim();
  return applySqlRequiredColumns({
    ...draft,
    name,
    description: draft.description.trim(),
    instruction: instruction.trim(),
    inputs: draft.inputs.map((input) => ({
      ...input,
      label: input.label.trim() || fileStates[input.id]?.name.replace(/\.csv$/i, "") || input.tableName,
    })),
    output: {
      ...draft.output,
      enabled: false,
      fileName: `${safeFileBaseName(name || "処理")}_結果.csv`,
      encoding: "utf-8",
    },
  });
}

function safeFileBaseName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim() || "処理";
}

function withExtension(fileName: string, extension: string) {
  return fileName.replace(/\.[^.]+$/, "") + extension;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
