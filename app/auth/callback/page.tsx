"use client";

import { useEffect, useRef, useState } from "react";
import {
  AUTH_POPUP_CHANNEL,
  AUTH_POPUP_COMPLETE,
  AUTH_POPUP_ERROR,
  AUTH_RETURN_TO_KEY,
  type AuthPopupMessage,
} from "@/lib/auth-flow";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const url = new URL(window.location.href);
    const isPopup = url.searchParams.get("popup") === "1";
    const notifyOpener = (message: AuthPopupMessage) => {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(AUTH_POPUP_CHANNEL);
        channel.postMessage(message);
        channel.close();
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, window.location.origin);
      }
    };
    const fail = (message: string) => {
      setError(message);
      if (isPopup) notifyOpener({ type: AUTH_POPUP_ERROR, message });
    };

    const client = getSupabaseBrowserClient();
    const code = url.searchParams.get("code");
    if (!client || !code) {
      queueMicrotask(() => fail("ログイン情報を確認できませんでした。"));
      return;
    }
    void client.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        fail("ログインを完了できませんでした。もう一度お試しください。");
        return;
      }
      if (isPopup) {
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
        setComplete(true);
        notifyOpener({ type: AUTH_POPUP_COMPLETE });
        window.setTimeout(() => window.close(), 100);
        return;
      }
      const returnTo = sessionStorage.getItem(AUTH_RETURN_TO_KEY) || "/";
      sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      window.location.replace(returnTo.startsWith("/") ? returnTo : "/");
    });
  }, []);

  return (
    <main className="auth-callback">
      {error ? (
        <div className="error-message">{error}</div>
      ) : complete ? (
        <div className="loading-row">ログインしました。この画面は自動で閉じます。</div>
      ) : (
        <div className="loading-row"><span className="spinner" />ログインしています</div>
      )}
    </main>
  );
}
