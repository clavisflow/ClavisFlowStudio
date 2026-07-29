"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Heart, Trash2, X } from "lucide-react";
import {
  getPortalActivityServerSnapshot,
  getPortalActivitySnapshot,
  subscribePortalActivity,
  toggleFavorite,
} from "@/lib/portal-activity";

export function FavoriteFlowsPanel() {
  const [open, setOpen] = useState(false);
  const activity = useSyncExternalStore(subscribePortalActivity, getPortalActivitySnapshot, getPortalActivityServerSnapshot);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const favorites = useMemo(
    () => Object.entries(activity.favorites)
      .filter(([, record]) => record.active)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt),
    [activity.favorites],
  );

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

  return (
    <>
      <button ref={triggerRef} type="button" className="saved-flows-trigger favorite-flows-trigger" aria-expanded={open} aria-controls="favorite-flows-panel" onClick={() => setOpen(true)}>
        <Heart size={17} aria-hidden="true" />お気に入り処理
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="saved-flows-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <aside id="favorite-flows-panel" className="saved-flows-panel" role="dialog" aria-modal="true" aria-labelledby="favorite-flows-title">
            <header>
              <h2 id="favorite-flows-title"><Heart size={21} aria-hidden="true" />お気に入り処理</h2>
              <button ref={closeRef} type="button" aria-label="閉じる" onClick={close}><X size={21} aria-hidden="true" /></button>
            </header>
            {favorites.length === 0 ? (
              <p className="saved-flows-empty">お気に入りに追加した処理はありません。</p>
            ) : (
              <div className="saved-flow-list">
                {favorites.map(([id, favorite]) => (
                  <article className="saved-flow-row" key={id}>
                    <div className="saved-flow-summary">
                      <div><h3>{favorite.name ?? id}</h3>{favorite.description && <p>{favorite.description}</p>}</div>
                    </div>
                    <div className="saved-flow-actions">
                      <a href={favorite.href ?? `/run/?flow=${encodeURIComponent(id)}`} onClick={close}><ExternalLink size={15} aria-hidden="true" />使ってみる</a>
                      <button type="button" className="saved-flow-delete" onClick={() => toggleFavorite(id)}><Trash2 size={15} aria-hidden="true" />お気に入りから削除</button>
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
