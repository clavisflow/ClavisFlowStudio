"use client";

import { Search, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { SavedFlowsPanel } from "@/components/saved-flows-panel";
import { FavoriteFlowsPanel } from "@/components/favorite-flows-panel";
import { useAuth } from "@/components/auth-provider";

type PortalHeaderProps = {
  query?: string;
  onQueryChange?: (query: string) => void;
  extra?: ReactNode;
};

export function PortalHeader({ query, onQueryChange, extra }: PortalHeaderProps) {
  const [localQuery, setLocalQuery] = useState("");
  const [notice, setNotice] = useState("");
  const { user, displayName, loading: authLoading, configured: authConfigured, signInWithGoogle, signOut } = useAuth();
  const controlled = query !== undefined && onQueryChange;
  const value = controlled ? query : localQuery;

  function updateQuery(next: string) {
    if (controlled) onQueryChange(next);
    else setLocalQuery(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (controlled) return;
    window.location.assign(value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : "/");
  }

  async function handleLogin() {
    try {
      if (!authConfigured) throw new Error("ログイン設定が完了していません");
      await signInWithGoogle();
    } catch (loginError) {
      setNotice(loginError instanceof Error ? loginError.message : "ログインを開始できませんでした");
      window.setTimeout(() => setNotice(""), 3000);
    }
  }

  async function handleLogout() {
    try {
      await signOut();
    } catch {
      setNotice("ログアウトできませんでした");
      window.setTimeout(() => setNotice(""), 3000);
    }
  }

  return (
    <>
      <header className="portal-header">
        <form className="portal-search" role="search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="portal-global-search">処理を検索</label>
          <input
            id="portal-global-search"
            value={value}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="やりたいこと・列名で検索（例：売上集計、重複削除、商品コード）"
          />
          {value && <button type="button" aria-label="検索語をクリア" onClick={() => updateQuery("")}><X size={17} /></button>}
        </form>
        <div className="portal-header-actions">
          {extra}
          <FavoriteFlowsPanel />
          <SavedFlowsPanel />
          {user ? (
            <details className="portal-account">
              <summary>{displayName}</summary>
              <button type="button" onClick={() => void handleLogout()}>ログアウト</button>
            </details>
          ) : (
            <button className="portal-login" type="button" disabled={authLoading} onClick={() => void handleLogin()}>ログイン</button>
          )}
        </div>
      </header>
      {notice && <div className="portal-toast" role="status">{notice}</div>}
    </>
  );
}
