"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Files, Pencil, Trash2, X } from "lucide-react";
import { deleteManagedFlow, editUrl, listManagedFlows, publicRunUrl } from "@/lib/flow-store";
import type { ManagedFlow } from "@/lib/flow-types";

export function SavedFlowsPanel() {
  const [open, setOpen] = useState(false);
  const [flows, setFlows] = useState<ManagedFlow[]>(() => listManagedFlows());
  const [confirmingId, setConfirmingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const [error, setError] = useState<string>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openPanel() {
    setFlows(listManagedFlows());
    setConfirmingId(undefined);
    setError(undefined);
    setOpen(true);
  }

  async function remove(flow: ManagedFlow) {
    setDeletingId(flow.publicId);
    setError(undefined);
    try {
      await deleteManagedFlow(flow);
      setFlows(listManagedFlows());
      setConfirmingId(undefined);
      if (new URL(window.location.href).searchParams.get("flow") === flow.publicId) window.location.assign("/");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "フローを削除できませんでした。");
    } finally {
      setDeletingId(undefined);
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="saved-flows-trigger" aria-expanded={open} aria-controls="saved-flows-panel" onClick={openPanel}>
        <Files size={17} aria-hidden="true" />作成済フロー
      </button>
      {open && (
        <div className="saved-flows-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside id="saved-flows-panel" className="saved-flows-panel" role="dialog" aria-modal="true" aria-labelledby="saved-flows-title">
            <header>
              <h2 id="saved-flows-title">作成済フロー</h2>
              <button ref={closeRef} type="button" aria-label="閉じる" onClick={close}><X size={21} aria-hidden="true" /></button>
            </header>
            {error && <div className="saved-flows-error">{error}</div>}
            {flows.length === 0 ? (
              <p className="saved-flows-empty">このブラウザで作成したフローはありません。</p>
            ) : (
              <div className="saved-flow-list">
                {flows.map((flow) => (
                  <article className="saved-flow-row" key={flow.publicId}>
                    <div className="saved-flow-summary">
                      <div><h3>{flow.name}</h3>{flow.description && <p>{flow.description}</p>}</div>
                      <span className={`saved-flow-status${flow.status === "published" ? " published" : " pending"}`}>{flow.status === "published" ? "公開中" : "未公開の変更があります"}</span>
                    </div>
                    <p className="saved-flow-meta">公開ID {flow.publicId}・バージョン {flow.version}・更新 {formatDate(flow.updatedAt)}</p>
                    <div className="saved-flow-actions">
                      {flow.status === "published" && <a href={publicRunUrl(flow.publicId)} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" />公開ページ</a>}
                      <a href={editUrl(flow)}><Pencil size={15} aria-hidden="true" />編集ページ</a>
                      <button type="button" className="saved-flow-delete" onClick={() => setConfirmingId(flow.publicId)}><Trash2 size={15} aria-hidden="true" />削除</button>
                    </div>
                    {confirmingId === flow.publicId && (
                      <div className="saved-flow-confirmation" role="alert">
                        <p>「{flow.name}」を公開データごと削除します。元に戻せません。</p>
                        <div><button type="button" className="button plain" disabled={deletingId === flow.publicId} onClick={() => setConfirmingId(undefined)}>キャンセル</button><button type="button" className="button danger-button" disabled={deletingId === flow.publicId} onClick={() => void remove(flow)}>{deletingId === flow.publicId ? "削除しています..." : "削除する"}</button></div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
