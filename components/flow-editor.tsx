"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronUp, Code2, Copy, Download, ExternalLink, FileSpreadsheet, Link2, LockKeyhole, Play, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { DEMO_PUBLIC_ID, demoFlow, getBundledSampleFiles } from "@/lib/demo-flow";
import { createManagedFlow, generateFlowSql, loadEditableFlow, publicRunUrl, updateManagedFlow } from "@/lib/flow-store";
import type { CsvEncoding, FileAnalysis, FlowDraft, FlowInput, InputColumn, ManagedFlow, QueryResult } from "@/lib/flow-types";
import { ProcessingClient } from "@/lib/processing-client";
import { inspectSqlStructure } from "@/lib/sql-safety";

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
const DEMO_INSTRUCTION = "請求データと入金データを請求番号で突き合わせて、入金済み、金額違い、未入金、請求のない入金が分かるようにして。";
const bundledDemoSamples = getBundledSampleFiles(DEMO_PUBLIC_ID);

function initialDraft(): FlowDraft {
  return {
    name: "",
    description: "",
    inputs: [],
    sql: "",
    output: { fileName: "result.csv", encoding: "utf-8-bom", enabled: true },
    duckdbVersion: "1.32.0",
  };
}

export function FlowEditor({ mode }: { mode: "create" | "edit" }) {
  const [draft, setDraft] = useState<FlowDraft>(initialDraft);
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [fileStates, setFileStates] = useState<Record<string, EditorFileState>>({});
  const [dragging, setDragging] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [generatedInstruction, setGeneratedInstruction] = useState<string>();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(true);
  const [copied, setCopied] = useState(false);
  const [existing, setExisting] = useState<ManagedFlow>();
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<ManagedFlow>();
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

  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  useEffect(() => {
    if (mode !== "edit") return;
    const publicId = new URL(window.location.href).searchParams.get("flow") ?? "";
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ?? undefined;
    loadEditableFlow(publicId, token)
      .then((flow) => {
        setExisting(flow);
        setDraft({ name: flow.name, description: flow.description, inputs: flow.inputs.map((input) => ({ ...input, headerRow: input.headerRow ?? 1 })), sql: flow.sql, output: flow.output, duckdbVersion: flow.duckdbVersion });
        setInstruction(flow.description);
        setGeneratedInstruction(flow.description);
        setDownloadEnabled(flow.output.enabled !== false);
        setActiveStep(2);
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
    const available = 2 - draft.inputs.length;
    if (available <= 0) { setError("CSVは最大2ファイルまで追加できます。"); return; }
    const validCsvFiles = selected.filter((file) => file.name.toLowerCase().endsWith(".csv"));
    if (validCsvFiles.length !== selected.length) setError("追加できるのは拡張子が .csv のファイルだけです。");
    if (validCsvFiles.length > available) setError("CSVは最大2ファイルまで追加できます。先頭のファイルを追加しました。");
    const csvFiles = validCsvFiles.slice(0, available);
    if (!csvFiles.length) return;

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
    setGeneratedInstruction(undefined);
    await Promise.all(additions.map(({ file, input }) => analyzeFile(file, input)));
  }

  async function replaceFile(inputId: string, file: File) {
    setError(undefined);
    if (!file.name.toLowerCase().endsWith(".csv")) { setError("選び直せるのは拡張子が .csv のファイルだけです。"); return; }
    const currentInput = draft.inputs.find((input) => input.id === inputId);
    if (!currentInput) return;
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
    setGeneratedInstruction(undefined);
    await analyzeFile(file, updatedInput);
  }

  async function startDemo() {
    const samples = bundledDemoSamples;
    if (!samples) { setError("デモ用CSVを準備できませんでした。"); return; }
    setDemoLoading(true);
    try {
      const demoFiles = [samples.invoices, samples.payments].map((sample) => new File([sample.text], sample.name, { type: "text/csv;charset=utf-8" }));
      await addFiles(demoFiles);
      setDraft((current) => ({
        ...current,
        name: demoFlow.name,
        description: demoFlow.description,
        sql: demoFlow.sql.replace(/\binvoices\b/g, "input_1").replace(/\bpayments\b/g, "input_2"),
        output: demoFlow.output,
      }));
      setInstruction(DEMO_INSTRUCTION);
      setGeneratedInstruction(DEMO_INSTRUCTION);
    } finally {
      setDemoLoading(false);
    }
  }

  async function analyzeFile(file: File, input: FlowInput) {
    if (!client.current) return;
    setFileStates((current) => ({
      ...current,
      [input.id]: { ...(current[input.id] ?? { id: input.id, name: file.name, size: file.size, expanded: false }), status: "analyzing", error: undefined },
    }));
    try {
      const analysis = await client.current.analyze(file, input.encoding, input.delimiter, input.headerRow ?? 1);
      const selectedEncoding = input.encoding === "auto" ? analysis.detectedEncoding : input.encoding;
      setDraft((current) => ({
        ...current,
        inputs: current.inputs.map((candidate) => candidate.id === input.id ? {
          ...candidate,
          encoding: selectedEncoding,
          requiredColumns: analysis.headers.map((name, index) => ({ name, type: analysis.columnTypes[index] ?? "VARCHAR", required: true })),
        } : candidate),
      }));
      setFileStates((current) => ({
        ...current,
        [input.id]: { ...current[input.id], status: analysis.warning ? "error" : "ready", analysis, error: analysis.warning },
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
    setGeneratedInstruction(undefined);
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
    setGeneratedInstruction(undefined);
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

  async function generateAndPreview() {
    setError(undefined);
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) { setError("やりたい処理を日本語で入力してください。"); return; }
    setAiGenerating(true);
    try {
      let sql = draft.sql;
      if (!sql.trim() || generatedInstruction !== trimmedInstruction) {
        sql = await generateFlowSql(trimmedInstruction, draft.inputs);
        setDraft((current) => ({ ...current, sql }));
        setGeneratedInstruction(trimmedInstruction);
      }
      await runPreview(sql);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "AIで処理を作成できませんでした。");
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
      const blob = new Blob([result.csv.buffer as ArrayBuffer], { type: "text/csv;charset=utf-8" });
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
      setExisting(result);
      setSaved(result);
      setCopied(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "フローを保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicUrl(publicId: string) {
    const url = new URL(publicRunUrl(publicId), window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  if (loading) return <main className="studio-shell"><div className="loading-row"><span className="spinner" />フローを読み込んでいます</div></main>;

  return (
    <main className="studio-shell wizard-shell">
      <header className="wizard-heading">
        {mode === "create" ? (
          <>
            <p className="wizard-page-name">新しいフローを作成</p>
            <h1>CSVから、業務アプリをAIで作って、そのまま公開。</h1>
            <p className="wizard-lead">やりたいことを日本語で説明するだけで、誰でも使える実行ページができあがります。</p>
          </>
        ) : (
          <h1>フローを編集</h1>
        )}
      </header>

      <WizardStepper activeStep={activeStep} onSelect={(step) => {
        if (step < activeStep || step === 2 && canLeaveStepOne() || step === 3 && Boolean(preview) || step === 4 && Boolean(preview)) {
          setError(undefined);
          setActiveStep(step);
        }
      }} />

      <section className="wizard-card">
        {activeStep === 1 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="section-heading">
              <h2>入力ファイルを追加</h2>
              <p>処理に使用するCSVファイルを追加してください。</p>
            </div>

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
            <div
              className={`csv-dropzone compact${dragging ? " dragging" : ""}${draft.inputs.length >= 2 ? " full" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); if (draft.inputs.length < 2) setDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = draft.inputs.length < 2 ? "copy" : "none"; }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); if (draft.inputs.length < 2) void addFiles(Array.from(event.dataTransfer.files)); }}
            >
              <Upload size={28} aria-hidden="true" />
              <div><strong>{draft.inputs.length >= 2 ? "CSVは2ファイル選択済みです" : "CSVファイルをここにドラッグ＆ドロップ"}</strong><span>UTF-8 / UTF-8 BOM / Shift-JIS / Windows-31J／CP932</span></div>
              <button type="button" className="button secondary" disabled={draft.inputs.length >= 2} onClick={() => openPicker()}>ファイルを選択</button>
            </div>
            <p className="privacy-note"><LockKeyhole size={17} aria-hidden="true" />CSVの処理はブラウザ内で行われ、選択したファイルはサーバーへ送信されません。</p>
            {draft.inputs.length === 0 && bundledDemoSamples && <div className="demo-tools"><button type="button" className="demo-link" disabled={demoLoading} onClick={() => void startDemo()}><Play size={15} aria-hidden="true" />{demoLoading ? "デモを準備しています..." : "デモで試してみる"}</button><span aria-hidden="true">・</span><span>デモ用CSV：</span><a href={demoCsvUrl(bundledDemoSamples.invoices.text)} download={bundledDemoSamples.invoices.name}><Download size={15} aria-hidden="true" />請求CSV</a><a href={demoCsvUrl(bundledDemoSamples.payments.text)} download={bundledDemoSamples.payments.name}><Download size={15} aria-hidden="true" />入金CSV</a></div>}

            {draft.inputs.length > 0 && (
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
                            <button type="button" className="replace-file" onClick={() => openPicker(input.id)}><RefreshCw size={16} aria-hidden="true" />選び直す</button>
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

            {error && <div className="error-message">{error}</div>}
            <div className="wizard-actions end">
              <div className="next-action">
                {!draft.inputs.length && !error && <p className="next-guide">CSVを追加すると次へ進めます。</p>}
                {draft.inputs.length > 0 && !canLeaveStepOne() && <p>解析エラーのあるCSVを修正または削除してください。</p>}
                <button type="button" className="button primary" disabled={draft.inputs.length > 0 && !canLeaveStepOne()} onClick={goToProcessing}>次へ：処理を作成 <ArrowRight size={17} aria-hidden="true" /></button>
              </div>
            </div>
          </div>
        )}

        {activeStep === 2 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="section-heading"><h2>やりたい処理を入力</h2><p>CSVをどう処理したいか、日本語で入力してください。</p></div>
            <div className="processing-form">
              <div className="schema-overview">
                <h3>CSVから読み取った列</h3>
                {draft.inputs.map((input) => <article key={input.id}><header><strong>{input.label || fileStates[input.id]?.name || "入力CSV"}</strong><span>{input.requiredColumns.length}列</span></header><div className="schema-preview">{input.requiredColumns.slice(0, 6).map((column) => <span key={column.name}>{column.name}<small>{column.type}</small></span>)}</div>{input.requiredColumns.length > 6 && <details><summary>すべての列を確認</summary><div>{input.requiredColumns.map((column) => <span key={column.name}>{column.name}<small>{column.type}</small></span>)}</div></details>}</article>)}
              </div>
              <label className="field instruction-field"><span>やりたいこと（処理）</span><textarea rows={6} maxLength={4000} placeholder="例：請求CSVと入金CSVを請求番号で照合して、未入金や金額の違いが分かるようにして。" value={instruction} onChange={(event) => { setInstruction(event.target.value); setGeneratedInstruction(undefined); }} /></label>
              <p className="ai-data-note"><LockKeyhole size={16} aria-hidden="true" />AIへ送るのは列名とデータ型、入力した処理内容だけです。CSVのデータ本体は送信しません。</p>
            </div>
            {error && <div className="error-message">{error}</div>}
            <div className="wizard-actions between"><button type="button" className="button plain" onClick={() => setActiveStep(1)}>戻る</button><button type="button" className="button primary" disabled={aiGenerating || previewing} onClick={() => void generateAndPreview()}><Sparkles size={18} aria-hidden="true" />{aiGenerating || previewing ? "処理を作成しています..." : "AIで処理を作成して結果を見る"}<ArrowRight size={17} aria-hidden="true" /></button></div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="section-heading"><h2>結果を確認</h2><p>追加したCSVでSQLをテスト実行した結果です。</p></div>
            {previewing && <div className="processing-status"><span className="spinner" /><strong>{phase || "処理中"}</strong><button type="button" className="text-button danger" onClick={() => client.current?.cancel()}>キャンセル</button></div>}
            {error && <div className="error-message">{error}</div>}
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
            {preview && (
              <>
                <div className="result-toolbar"><div><h3>プレビュー</h3><p>{preview.totalRows.toLocaleString()}件を処理しました（{preview.elapsedMs.toLocaleString()}ms）</p></div></div>
                <div className="table-wrap"><table><thead><tr>{preview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{preview.columns.map((column) => <td key={column}>{row[column] == null ? "—" : String(row[column])}</td>)}</tr>)}</tbody></table></div>
                {preview.totalRows > 100 && <p className="table-note">画面は先頭100件のみ表示しています。</p>}
              </>
            )}
            <div className="wizard-actions between"><button type="button" className="button plain" disabled={previewing} onClick={() => setActiveStep(2)}>戻る</button><button type="button" className="button primary" disabled={!preview || previewing} onClick={() => { setError(undefined); setActiveStep(4); }}>次へ：公開 <ArrowRight size={17} aria-hidden="true" /></button></div>
          </div>
        )}

        {activeStep === 4 && (
          <div className="wizard-panel" role="tabpanel">
            <div className="section-heading"><h2>公開</h2><p>フロー定義を保存し、ログイン不要の実行URLを発行します。CSV本体は保存されません。</p></div>
            <div className="publish-form">
              <label className="field"><span>フロー名（任意）</span><input value={draft.name} maxLength={120} placeholder="未入力の場合は処理内容から自動設定" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="publication-control"><input type="checkbox" checked={downloadEnabled} onChange={(event) => setDownloadEnabled(event.target.checked)} /><span><strong>結果をファイルに出力する</strong><small>実行者が結果CSVをダウンロードできます。オフの場合は画面表示だけになります。</small></span></label>
              {downloadEnabled && <div className="field-grid two-columns output-settings"><label className="field"><span>出力ファイル名</span><input value={draft.output.fileName} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, fileName: event.target.value } })} /></label><label className="field"><span>文字コード</span><select value={draft.output.encoding} onChange={(event) => setDraft({ ...draft, output: { ...draft.output, encoding: event.target.value as FlowDraft["output"]["encoding"] } })}><option value="utf-8-bom">UTF-8 BOM</option><option value="utf-8">UTF-8</option></select></label></div>}
            </div>
            {error && <div className="error-message">{error}</div>}
            {saved && (
              <div className="public-url-result"><strong><Link2 size={19} aria-hidden="true" />公開URLを発行しました</strong><div className="public-url-copy"><input readOnly value={new URL(publicRunUrl(saved.publicId), window.location.origin).toString()} aria-label="公開URL" /><button type="button" className="button secondary" onClick={() => void copyPublicUrl(saved.publicId)}><Copy size={17} aria-hidden="true" />{copied ? "コピーしました" : "コピー"}</button></div><a className="public-open-link" href={publicRunUrl(saved.publicId)} target="_blank" rel="noreferrer">公開ページを開く<ExternalLink size={16} aria-hidden="true" /></a></div>
            )}
            <div className="wizard-actions between"><button type="button" className="button plain" onClick={() => setActiveStep(3)}>戻る</button><button type="button" className="button primary" disabled={saving} onClick={() => void saveAndPublish()}><Link2 size={18} aria-hidden="true" />{saving ? "公開しています..." : existing ? "更新して公開" : "公開URLを発行"}</button></div>
          </div>
        )}
      </section>
    </main>
  );
}

function WizardStepper({ activeStep, onSelect }: { activeStep: WizardStep; onSelect: (step: WizardStep) => void }) {
  const steps: Array<{ number: WizardStep; label: string }> = [
    { number: 1, label: "ファイルを追加" },
    { number: 2, label: "処理を作成" },
    { number: 3, label: "結果を確認" },
    { number: 4, label: "公開" },
  ];
  return (
    <nav className="wizard-stepper" aria-label="フロー作成ステップ">
      <ol>{steps.map((step) => <li key={step.number} className={step.number === activeStep ? "active" : step.number < activeStep ? "complete" : ""}><button type="button" aria-current={step.number === activeStep ? "step" : undefined} onClick={() => onSelect(step.number)}><span>{step.number < activeStep ? <Check size={16} aria-hidden="true" /> : step.number}</span><strong>{step.label}</strong></button></li>)}</ol>
    </nav>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function demoCsvUrl(text: string) {
  return `data:text/csv;charset=utf-8,%EF%BB%BF${encodeURIComponent(text)}`;
}

function prepareDraft(draft: FlowDraft, fileStates: Record<string, EditorFileState>, instruction: string, downloadEnabled: boolean): FlowDraft {
  const instructionText = instruction.trim();
  return {
    ...draft,
    name: draft.name.trim() || instructionText.replace(/\s+/g, " ").slice(0, 60) || "新しいフロー",
    description: draft.description.trim() || instructionText,
    inputs: draft.inputs.map((input) => ({
      ...input,
      label: input.label.trim() || fileStates[input.id]?.name.replace(/\.csv$/i, "") || input.tableName,
    })),
    output: { ...draft.output, enabled: downloadEnabled, fileName: draft.output.fileName.trim() || "result.csv" },
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
  if (draft.output.enabled !== false && !draft.output.fileName.trim().toLowerCase().endsWith(".csv")) return "出力ファイル名は.csvで終わる名前にしてください。";
}
