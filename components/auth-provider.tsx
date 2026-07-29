"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
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
const RETURN_TO_KEY = "clavisflow.auth-return-to";

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
    sessionStorage.setItem(RETURN_TO_KEY, returnTo);
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback/?popup=1` },
    });
    if (error) throw error;
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

export function authReturnToKey() {
  return RETURN_TO_KEY;
}
