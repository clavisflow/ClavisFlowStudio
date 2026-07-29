"use client";

import { useEffect, useState } from "react";
import { authReturnToKey } from "@/components/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const code = new URL(window.location.href).searchParams.get("code");
    if (!client || !code) {
      queueMicrotask(() => setError("ログイン情報を確認できませんでした。"));
      return;
    }
    void client.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        setError("ログインを完了できませんでした。もう一度お試しください。");
        return;
      }
      const returnTo = sessionStorage.getItem(authReturnToKey()) || "/";
      sessionStorage.removeItem(authReturnToKey());
      window.location.replace(returnTo.startsWith("/") ? returnTo : "/");
    });
  }, []);

  return <main className="auth-callback">{error ? <div className="error-message">{error}</div> : <div className="loading-row"><span className="spinner" />ログインしています</div>}</main>;
}
