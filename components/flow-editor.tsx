"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Code2, Copy, Download, ExternalLink, FileSpreadsheet, Link2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { createManagedFlow, editUrl, generateFlowSql, loadEditableFlow, publicRunUrl, savedFlowFromPublicationError, updateManagedFlow } from "@/lib/flow-store";
import type { CsvEncoding, FileAnalysis, FlowDraft, FlowInput, InputColumn, ManagedFlow, QueryResult } from "@/lib/flow-types";
import { ProcessingClient } from "@/lib/processing-client";
import { getSampleTemplate, sampleTemplates } from "@/lib/sample-templates";
import { inspectSqlStructure } from "@/lib/sql-safety";
import { ResultTable } from "@/components/result-table";

type WizardStep = 1 | 2 | 3 | 4;
type PreviewResult = Omit<QueryResult, "csv">;
type EditorFileState = {
  id: string;
  name: string;
  size: number;
  status: "analyzing" | "ready" | "error";
  analysis?: FileAnalysis;
  error?: string;
  expanded: boolean;
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
  const [preview, setPreview] = useState<PreviewResult>();
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const files = useRef<Record<string, File>>({});
  const picker = useRef<HTMLInputElement>(null);
  const replacingInputId = useRef<string | undefined>(undefined);
  const client = useRef<ProcessingClient | null>(null);

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
      .then((flow) => {
        const loadedInstruction = flow.instruction ?? flow.description;
        const loadedDownloadEnabled = flow.output.enabled !== false;
        const loadedDraft: FlowDraft = { name: flow.name, description: flow.description, instruction: loadedInstruction, inputs: flow.inputs.map((input) => ({ ...input, headerRow: input.headerRow ?? 1 })), sql: flow.sql, output: flow.output, duckdbVersion: flow.duckdbVersion };
        setExisting(flow);
        setDraft(loadedDraft);
        setInstruction(loadedInstruction);
        setGeneratedInstruction(loadedInstruction);
        setHasGeneratedSql(true);
        setDownloadEnabled(loadedDownloadEnabled);
        setPublishedSnapshot(editorSnapshot(loadedDraft, loadedInstruction, loadedDownloadEnabled));
        setActiveStep(1);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "フローを読み込めませんでした。"))
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
    const unassignedInputs = mode === "edit" ? draft.inputs.filter((input) => !files.current[input.id]) : [];
    const available = unassignedInputs.length || 2 - draft.inputs.length;
    if (available <= 0) { setError("CSVは最大2ファイルまで追加できます。"); return; }
    const validCsvFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".csv"));
    if (validCsvFiles.length !== selected.length) setError("追加できるのは拡張子が .csv のファイルだけです。");
    if (validCsvFiles.length > available) setError("CSVは最大2ファイルまで追加できます。先頭のファイルを追加しました。");
    const csvFiles = validCsvFiles.slice(0, available);
    if (!csvFiles.length) return;

    if (unassignedInputs.length) {
      const assignments = csvFiles.map((file, index) => ({ file, input: unassignedInputs[index] }));
      assignments.forEach(({ file, input }) => { files.current[input.id] = file; });
      setFileStates((current) => ({
        ...current,
        ...Object.fromEntries(assignments.map(({ file, input }) => [input.id, { id: input.id, name: file.name, size: file.size, status: "analyzing", expanded: false } satisfies EditorFileState])),
      }));
      clearPreview();
      await Promise.all(assignments.map(({ file, input }) => analyzeFile(file, input, false)));
      return;
    }

    const firstNumber = nextTableNumber();
    const additions = csvFiles.map((file, index) => {
      const number = firstNumber + index;
      const id = crypto.randomUUID();
      const input: FlowInput = {
        id,
        label: file.name.replace(/\.csv$/i, ""),
        tableName: `input_${number}`,
        encoding: "auto",
        delimiter: ",",
        headerRow: 1,
        requiredColumns: [],
      };
      files.current[id] = file;
      return { file, input };
    });

    setDraft((current) => ({
      ...current,
      inputs: [...current.inputs, ...additions.map(({ input }) => input)],
    }));
    setFileStates((current) => ({
      ...current,
      ...Object.fromEntries(additions.map(({ file, input }) => [input.id, { id: input.id, name: file.name, size: file.size, status: "analyzing", expanded: false } satisfies EditorFileState])),
    }));
    clearPreview();
    await Promise.all(additions.map(({ file, input }) => analyzeFile(file, input)));
  }

  async function replaceFile(inputId: string, file: File) {
    setError(undefined);
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("選び直せるのは拡張子が .csv のファイルだけです。"); return; }
    const currentInput = draft.inputs.find((input) => input.id === inputId);
    if (!currentInput) return;
    if (mode === "edit") {
      files.current[inputId] = file;
      setFileStates((current) => ({ ...current, [inputId]: { id: inputId, name: file.name, size: file.size, status: "analyzing", expanded: false } }));
      clearPreview();
      await analyzeFile(file, currentInput, false);
      return;
    }
    const updatedInput: FlowInput = {
      ...currentInput,
      label: file.name.replace(/\.csv$/i, ""),
      encoding: "auto",
      delimiter: ",",
      headerRow: 1,
      requiredColumns: [],
    };
    files.current[inputId] = file;
    setDraft((current) => ({ ...current, inputs: current.inputs.map((input) => input.id === inputId ? updatedInput : input) }));
    setFileStates((current) => ({ ...current, [inputId]: { id: inputId, name: file.name, size: file.size, status: "analyzing", expanded: false } }));
    clearPreview();
    await analyzeFile(file, updatedInput);
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
    const sampleId = new URL(window.location.href).searchParams.get("sample");
    if (sampleId) void startSample(sampleId);
    // URLで選ばれたサンプルは初回表示時だけ読み込む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function analyzeFile(file: File, input: FlowInput, updateDefinition = true) {
    if (!client.current) return;
    setFileStates((current) => ({
      ...current,
      [input.id]: { ...(current[input.id] ?? { id: input.id, name: file.name, size: file.size, expanded: false }), status: "analyzing", error: undefined },
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

  function removeFile(inputId: string) {
    delete files.current[inputId];
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
    if (!draft.inputs.length) { setError("CSVを1件以上追加してください。"); return; }
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
    setSaving(true);
    try {
      const result = existing ? await updateManagedFlow(existing, preparedDraft, true) : await createManagedFlow(preparedDraft, true);
      const publishedInstruction = preparedDraft.instruction ?? instruction.trim();
      setExisting(result);
      setDraft(preparedDraft);
      setInstruction(publishedInstruction);
      setGeneratedInstruction(publishedInstruction);
      setHasGeneratedSql(true);
      setPublishedSnapshot(editorSnapshot(preparedDraft, publishedInstruction, downloadEnabled));
      setPublishedResult(result);
      setCopiedLink(undefined);
    } catch (saveError) {
      const savedFlow = savedFlowFromPublicationError(saveError);
      if (savedFlow) setExisting(savedFlow);
      setError(saveError instanceof Error ? saveError.message : "フローを保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function copyFlowUrl(kind: "public" | "edit") {
    if (!existing) return;
    const path = kind === "public" ? publicRunUrl(existing.publicId) : editUrl(existing);
    const url = new URL(path, window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopiedLink(kind);
  }

  if (loading) return <main className="studio-shell"><div className="loading-row"><span className="spinner" />フローを読み込んでいます</div></main>;
  const canAddMoreFiles = mode === "edit" ? draft.inputs.some((input) => !files.current[input.id]) : draft.inputs.length < 2;
  const hasUnpublishedChanges = Boolean(existing && (existing.status !== "published" || publishedSnapshot !== editorSnapshot(draft, instruction, downloadEnabled)));

  return (
    <main className="studio-shell wizard-shell">
      <header className="wizard-heading">
        <div className="wizard-heading-row">
          <h1>{mode === "create" ? "新しいフローを作成" : "作成済みフローを編集"}</h1>
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
              accept=".csv,text/csv"
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
            {mode === "edit" ? (
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
                        <div><strong>CSVをここにドロップ</strong><span>または</span></div>
                        <button type="button" className="button secondary" onClick={() => openPicker(input.id)}>ファイルを選択</button>
                      </div>
                      {state?.status === "analyzing" && <p className="edit-input-file-status"><span className="spinner small" />{state.name}を解析しています</p>}
                      {state?.status === "ready" && state.analysis && <p className="edit-input-file-status success-text">{state.name}　確認済み・{state.analysis.rowCount.toLocaleString()}行</p>}
                      {state?.error && <div className="inline-file-error edit-input-error">{state.error}</div>}
                    </article>
                  );
                })}
              </div>
            ) : (
              <>
            <div
              className={`csv-dropzone compact${dragging ? " dragging" : ""}${!canAddMoreFiles ? " full" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); if (canAddMoreFiles) setDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = canAddMoreFiles ? "copy" : "none"; }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); if (canAddMoreFiles) void addFiles(Array.from(event.dataTransfer.files)); }}
            >
              <div>
                <strong>{canAddMoreFiles ? "CSVをここにドロップ" : "必要なCSVを選択済みです"}</strong>
                {canAddMoreFiles && <span>または</span>}
              </div>
              <button type="button" className="button secondary" disabled={!canAddMoreFiles} onClick={() => openPicker()}>ファイルを選択</button>
            </div>

            {draft.inputs.some((input) => Boolean(fileStates[input.id])) && (
              <div className="added-files">
                <h3>追加したファイル</h3>
                <div className="editor-file-list">
                  {draft.inputs.map((input) => {
                    const state = fileStates[input.id];
                    if (!state) return null;
                    return (
                      <article className="editor-file-card" key={input.id}>
                        <div className="file-card-main">
                          <div className="csv-file-icon" aria-hidden="true"><FileSpreadsheet size={25} /></div>
                          <div className="file-card-info">
                            <h4>{state.name}</h4>
                            {state.status === "analyzing" ? (
                              <p className="file-meta"><span className="spinner small" />CSVを解析しています</p>
                            ) : state.analysis ? (
                              <p className="file-meta"><span className="read-status">読み込み完了</span>・ {formatFileSize(state.size)} ・ {state.analysis.rowCount.toLocaleString()}行 ・ {state.analysis.headers.length.toLocaleString()}列</p>
                            ) : null}
                          </div>
                          <div className="file-card-actions">
                            <button type="button" className="detail-toggle" aria-expanded={state.expanded} onClick={() => setFileStates((current) => ({ ...current, [input.id]: { ...current[input.id], expanded: !current[input.id].expanded } }))}>
                              文字コード・詳細設定 {state.expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                            </button>
                            <button type="button" className="delete-file" aria-label={`${state.name}を削除`} onClick={() => removeFile(input.id)}><Trash2 size={19} aria-hidden="true" /></button>
                          </div>
                        </div>

                        {state.analysis && (
                          <div className="column-preview" aria-label="列名プレビュー">
                            <span className="column-preview-label">列</span>
                            {state.analysis.headers.slice(0, 8).map((header) => <span className="column-chip" key={header}>{header}</span>)}
                            {state.analysis.headers.length > 8 && <span className="column-chip">他 {state.analysis.headers.length - 8}列</span>}
                          </div>
                        )}
                        {state.error && <div className="inline-file-error">{state.error}</div>}

                        {state.expanded && (
                          <div className="file-details">
                            <div className="detail-grid">
                              <label className="field"><span>識別名</span><input required value={input.label} onChange={(event) => updateInput(input.id, { label: event.target.value })} onBlur={() => { if (!input.label.trim()) updateInput(input.id, { label: state.name.replace(/\.csv$/i, "") }); }} /></label>
                              <label className="field"><span>文字コード</span><select value={input.encoding} onChange={(event) => updateInput(input.id, { encoding: event.target.value as CsvEncoding }, true)}>{encodingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                              <label className="field"><span>区切り文字</span><select value={input.delimiter} onChange={(event) => updateInput(input.id, { delimiter: event.target.value as FlowInput["delimiter"] }, true)}><option value=",">カンマ</option><option value="\t">タブ</option><option value=";">セミコロン</option></select></label>
                              <label className="field"><span>ヘッダー行</span><input type="number" min={1} max={100} value={input.headerRow ?? 1} onChange={(event) => updateInput(input.id, { headerRow: Math.max(1, Number(event.target.value) || 1) })} onBlur={() => { const file = files.current[input.id]; if (file) void analyzeFile(file, draft.inputs.find((candidate) => candidate.id === input.id) ?? input); }} /></label>
                            </div>
                            {input.requiredColumns.length > 0 && (
                              <div className="inferred-columns">
                                <h5>推定された列のデータ型</h5>
                                <div className="inferred-column-list">
                                  {input.requiredColumns.map((column, columnIndex) => (
                                    <label key={`${input.id}-${column.name}`}><span>{column.name}</span><select value={column.type} onChange={(event) => updateColumnType(input.id, columnIndex, event.target.value as InputColumn["type"])}>{inputTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
              </>
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
              <label className="field"><span>フロー名</span><input value={draft.name} maxLength={120} placeholder="例：請求・入金チェック" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="field"><span>説明（任意）</span><textarea rows={3} maxLength={1000} placeholder="このフローでできることを入力" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <label className="publication-control"><input type="checkbox" checked={downloadEnabled} onChange={(event) => setDownloadEnabled(event.target.checked)} /><span><strong>出力ファイルを指定する</strong><small>ファイル名と文字コードを指定します。未指定でも結果はダウンロードできます。</small></span></label>
              {downloadEnabled && <div className="field-grid two-columns output-settings"><label className="field"><span>出力ファイル名</span><input value={draft.output.fileName} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, fileName: event.target.value } })} /></label><label className="field"><span>文字コード</span><select value={draft.output.encoding} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, encoding: event.target.value as FlowDraft["output"]["encoding"] } })}><option value="utf-8">UTF-8</option><option value="utf-8-bom">UTF-8 BOM</option><option value="shift_jis">Shift-JIS</option><option value="cp932">Windows-31J／CP932</option></select></label></div>}
            </div>
            {error && <div className="error-message">{error}</div>}
            {publishedResult && (
              <div className="public-url-result">
                <strong><Link2 size={19} aria-hidden="true" />公開しました</strong>
                <div className="public-url-copy"><input readOnly value={new URL(publicRunUrl(publishedResult.publicId), window.location.origin).toString()} aria-label="公開URL" /><button type="button" className="button secondary" onClick={() => void copyFlowUrl("public")}><Copy size={17} aria-hidden="true" />{copiedLink === "public" ? "コピーしました" : "コピー"}</button></div>
                <div className="published-links"><a href={publicRunUrl(publishedResult.publicId)} target="_blank" rel="noreferrer">公開ページを開く<ExternalLink size={16} aria-hidden="true" /></a><a href={editUrl(publishedResult)}>編集用URLを開く<ExternalLink size={16} aria-hidden="true" /></a></div>
              </div>
            )}
            <div className="wizard-actions between"><button type="button" className="button plain" onClick={() => setActiveStep(3)}>戻る</button><button type="button" className="button primary" disabled={saving || Boolean(existing && !hasUnpublishedChanges)} onClick={() => void saveAndPublish()}><Link2 size={18} aria-hidden="true" />{saving ? "公開しています..." : existing ? "変更を公開" : "公開URLを発行"}</button></div>
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
  if (!draft.inputs.length) return "CSVを1件以上追加してください。";
  if (draft.inputs.length > 2) return "CSVは最大2ファイルまで追加できます。";
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
  if (!draft.name.trim()) return "フロー名を入力してください。";
  if (!draft.output.fileName.trim().toLowerCase().endsWith(".csv")) return "出力ファイル名は.csvで終わる名前にしてください。";
}
