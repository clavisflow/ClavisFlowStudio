"use client";

import {
  ArrowDown,
  ArrowUp,
  CloudUpload,
  FileText,
  Link2,
  LoaderCircle,
  Sheet,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, type DragEvent, type ReactNode } from "react";

type DataSourcePickerProps = {
  dragging: boolean;
  disabled?: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onFiles: (files: File[]) => void;
  onGoogle: () => void;
};

export function DataSourcePicker({
  dragging,
  disabled = false,
  onDraggingChange,
  onFiles,
  onGoogle,
}: DataSourcePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (disabled || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    onDraggingChange(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    onDraggingChange(false);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    onDraggingChange(false);
    if (!disabled) onFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className={`data-source-picker${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => {
        if (!disabled) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
    >
      <div className="data-source-picker-icon"><UploadCloud size={32} aria-hidden="true" /></div>
      <div className="data-source-picker-copy">
        <strong>{dragging ? "ここにファイルをドロップ" : "入力ファイルをドラッグ＆ドロップ"}</strong>
        <p>CSV、Excel（.xlsx）、JSONを複数まとめて追加できます。</p>
      </div>
      <div className="data-source-picker-actions">
        <button type="button" className="button secondary" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <FileText size={18} aria-hidden="true" />ファイルを選択
        </button>
        <button type="button" className="button secondary" disabled={disabled} onClick={onGoogle}>
          <Sheet size={18} aria-hidden="true" />Googleスプレッドシートを追加
        </button>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".csv,.xlsx,.json,text/csv,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          onFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

type DataSourceCardProps = {
  index: number;
  total: number;
  sourceName: string;
  resourceName: string;
  kindLabel: string;
  identifier: string;
  rowCount?: number;
  columnCount?: number;
  busy?: boolean;
  actionsDisabled?: boolean;
  orderingDisabled?: boolean;
  showActions?: boolean;
  error?: string;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  children?: ReactNode;
  afterSettings?: ReactNode;
};

export function DataSourceCard({
  index,
  total,
  sourceName,
  resourceName,
  kindLabel,
  identifier,
  rowCount,
  columnCount,
  busy = false,
  actionsDisabled = false,
  orderingDisabled = false,
  showActions = true,
  error,
  onMove,
  onDelete,
  children,
  afterSettings,
}: DataSourceCardProps) {
  const showOrdering = total > 1;
  return (
    <article className="data-source-card">
      <header className="data-source-card-header">
        {showOrdering && (
          <div className="data-source-order" aria-label={`データソース ${index + 1}`}>
            <strong>{index + 1}</strong>
          </div>
        )}
        <div className="data-source-card-title">
          <p>{sourceName}</p>
          <h3>{resourceName}</h3>
        </div>
        <span className="data-source-kind">{kindLabel}</span>
        {showActions && <div className="data-source-card-actions" aria-label={`${sourceName}の操作`}>
          {showOrdering && (
            <>
              <button type="button" aria-label="上へ移動" disabled={index === 0 || busy || actionsDisabled || orderingDisabled} onClick={() => onMove(-1)}><ArrowUp size={18} /></button>
              <button type="button" aria-label="下へ移動" disabled={index === total - 1 || busy || actionsDisabled || orderingDisabled} onClick={() => onMove(1)}><ArrowDown size={18} /></button>
            </>
          )}
          <button type="button" className="danger" aria-label={`${sourceName}を削除`} disabled={busy || actionsDisabled} onClick={onDelete}><Trash2 size={18} /></button>
        </div>}
      </header>

      <dl className="data-source-facts">
        <div><dt>データソース名</dt><dd>{sourceName}</dd></div>
        <div><dt>{kindLabel === "Googleスプレッドシート" ? "スプレッドシート名" : "ファイル名"}</dt><dd>{resourceName}</dd></div>
        <div><dt>データソース種別</dt><dd>{kindLabel}</dd></div>
        <div><dt>識別名</dt><dd><code>{identifier}</code></dd></div>
        <div><dt>行数・列数</dt><dd>{rowCount === undefined || columnCount === undefined ? "解析前" : `${rowCount.toLocaleString()}行・${columnCount.toLocaleString()}列`}</dd></div>
      </dl>

      {children && <div className="data-source-settings">{children}</div>}
      {busy && <div className="data-source-state"><LoaderCircle className="spin-icon" size={19} aria-hidden="true" />データを解析しています</div>}
      {error && <div className="data-source-error">{error}</div>}
      {afterSettings}
    </article>
  );
}

type GoogleSheetModalProps = {
  open: boolean;
  url: string;
  loading: boolean;
  onUrlChange: (url: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function GoogleSheetModal({
  open,
  url,
  loading,
  onUrlChange,
  onClose,
  onSubmit,
}: GoogleSheetModalProps) {
  if (!open) return null;
  return (
    <div className="data-source-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose();
    }}>
      <section className="data-source-modal" role="dialog" aria-modal="true" aria-labelledby="google-sheet-modal-title">
        <header>
          <div>
            <h2 id="google-sheet-modal-title">Googleスプレッドシートを追加</h2>
            <p>共有可能なスプレッドシートのURLを入力してください。</p>
          </div>
          <button type="button" aria-label="閉じる" disabled={loading} onClick={onClose}><X size={20} /></button>
        </header>
        <label className="data-source-modal-field">
          <span>スプレッドシートURL</span>
          <div>
            <Link2 size={18} aria-hidden="true" />
            <input
              autoFocus
              type="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && url.trim() && !loading) onSubmit(); }}
            />
          </div>
        </label>
        <p className="data-source-modal-note"><CloudUpload size={17} aria-hidden="true" />リンクを知っている全員が閲覧できる設定のシートに対応しています。</p>
        <footer>
          <button type="button" className="button plain" disabled={loading} onClick={onClose}>キャンセル</button>
          <button type="button" className="button primary" disabled={!url.trim() || loading} onClick={onSubmit}>
            {loading && <LoaderCircle className="spin-icon" size={18} aria-hidden="true" />}
            {loading ? "読み込んでいます..." : "追加する"}
          </button>
        </footer>
      </section>
    </div>
  );
}
