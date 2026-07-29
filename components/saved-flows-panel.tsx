"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Globe2, LibraryBig, Link2, Pencil, X } from "lucide-react";
import { editUrl, listManagedFlows, normalizeFlowVisibility, publicRunUrl } from "@/lib/flow-store";
import type { ManagedFlow } from "@/lib/flow-types";

export function SavedFlowsPanel() {
  const [open, setOpen] = useState(false);
  const [flows, setFlows] = useState<ManagedFlow[]>(() => listManagedFlows());
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
    setOpen(true);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="saved-flows-trigger" aria-expanded={open} aria-controls="saved-flows-panel" onClick={openPanel}>
        <LibraryBig size={17} aria-hidden="true" />作成済み処理
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="saved-flows-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside id="saved-flows-panel" className="saved-flows-panel" role="dialog" aria-modal="true" aria-labelledby="saved-flows-title">
            <header>
              <h2 id="saved-flows-title"><LibraryBig size={21} aria-hidden="true" />作成済み処理</h2>
              <button ref={closeRef} type="button" aria-label="閉じる" onClick={close}><X size={21} aria-hidden="true" /></button>
            </header>
            {flows.length === 0 ? (
              <p className="saved-flows-empty">このブラウザで作成した処理はありません。</p>
            ) : (
              <div className="saved-flow-list">
                {flows.map((flow) => (
                  <article className="saved-flow-row" key={flow.publicId}>
                    <div className="saved-flow-summary">
                      <div><h3>{flow.name}</h3>{flow.description && <p>{flow.description}</p>}</div>
                      {flow.status === "published" ? (
                        <span className={`flow-visibility-badge ${normalizeFlowVisibility(flow.visibility)}`}>
                          {normalizeFlowVisibility(flow.visibility) === "unlisted" ? <Link2 size={15} aria-hidden="true" /> : <Globe2 size={15} aria-hidden="true" />}
                          {normalizeFlowVisibility(flow.visibility) === "unlisted" ? "限定公開" : "一般公開"}
                        </span>
                      ) : (
                        <span className={`flow-state-badge ${flow.status}`}>{flow.status === "draft" ? "下書き" : "公開停止中"}</span>
                      )}
                    </div>
                    <p className="saved-flow-meta">公開ID {flow.publicId}・バージョン {flow.version}・更新 {formatDate(flow.updatedAt)}</p>
                    <div className="saved-flow-actions">
                      {flow.status === "published" && <a href={publicRunUrl(flow.publicId)} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" />公開ページ</a>}
                      <a href={editUrl(flow)}><Pencil size={15} aria-hidden="true" />編集ページ</a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
