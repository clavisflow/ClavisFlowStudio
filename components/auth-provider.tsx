"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AUTH_POPUP_CHANNEL,
  AUTH_POPUP_COMPLETE,
  AUTH_POPUP_ERROR,
  AUTH_POPUP_NAME,
  AUTH_RETURN_TO_KEY,
  isAuthPopupMessage,
  type AuthPopupMessage,
} from "@/lib/auth-flow";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { userDisplayName } from "@/lib/user-display-name";

type AuthContextValue = {
  user?: User;
  displayName?: string;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user ?? undefined);
        setLoading(false);
      }
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  async function signInWithGoogle() {
    if (!client) throw new Error("ログイン設定が完了していません。");
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, returnTo);

    const popup = window.open(
      "about:blank",
      AUTH_POPUP_NAME,
      "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes",
    );
    if (!popup) {
      sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      throw new Error("ログイン画面を開けませんでした。ポップアップを許可して、もう一度お試しください。");
    }

    try {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback/?popup=1`,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("ログイン先を取得できませんでした。");

      const completion = new Promise<void>((resolve, reject) => {
        let settled = false;
        let checkingSession = false;
        const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(AUTH_POPUP_CHANNEL);
        let closedTimer = 0;
        let timeoutTimer = 0;

        const cleanup = () => {
          window.removeEventListener("message", handleWindowMessage);
          channel?.close();
          window.clearInterval(closedTimer);
          window.clearTimeout(timeoutTimer);
        };
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(message));
        };
        const finish = () => {
          if (settled || checkingSession) return;
          checkingSession = true;
          void client.auth.getUser().then(({ data: userData, error: userError }) => {
            checkingSession = false;
            if (settled) return;
            if (userError || !userData.user) {
              fail("ログイン情報を確認できませんでした。もう一度お試しください。");
              return;
            }
            settled = true;
            cleanup();
            setUser(userData.user);
            setLoading(false);
            resolve();
          }).catch(() => {
            checkingSession = false;
            fail("ログイン情報を確認できませんでした。もう一度お試しください。");
          });
        };
        const receive = (message: AuthPopupMessage) => {
          if (message.type === AUTH_POPUP_COMPLETE) finish();
          else if (message.type === AUTH_POPUP_ERROR) fail(message.message);
        };
        function handleWindowMessage(event: MessageEvent<unknown>) {
          if (event.origin !== window.location.origin || !isAuthPopupMessage(event.data)) return;
          receive(event.data);
        }

        window.addEventListener("message", handleWindowMessage);
        if (channel) {
          channel.onmessage = (event: MessageEvent<unknown>) => {
            if (isAuthPopupMessage(event.data)) receive(event.data);
          };
        }
        closedTimer = window.setInterval(() => {
          if (!popup.closed) return;
          window.clearInterval(closedTimer);
          finish();
        }, 400);
        timeoutTimer = window.setTimeout(() => fail("ログインが完了しませんでした。もう一度お試しください。"), 5 * 60 * 1000);
      });

      popup.location.replace(data.url);
      popup.focus();
      await completion;
      sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    } catch (loginError) {
      sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      if (!popup.closed) popup.close();
      throw loginError;
    }
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function updateDisplayName(displayName: string) {
    if (!client || !user) throw new Error("ログイン情報を確認できません。");
    const normalizedName = displayName.trim();
    if (!normalizedName) throw new Error("表示名を入力してください。");
    const { data, error } = await client.auth.updateUser({
      data: { display_name: normalizedName.slice(0, 80) },
    });
    if (error) throw error;
    if (!data.user) throw new Error("表示名を保存できませんでした。");
    setUser(data.user);
  }

  const value: AuthContextValue = {
    user,
    displayName: user ? userDisplayName(user) : undefined,
    loading,
    configured: Boolean(client),
    signInWithGoogle,
    updateDisplayName,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
