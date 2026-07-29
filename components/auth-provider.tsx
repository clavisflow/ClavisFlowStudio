"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type AuthContextValue = {
  user?: User;
  displayName?: string;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
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

  const value: AuthContextValue = {
    user,
    displayName: user ? userDisplayName(user) : undefined,
    loading,
    configured: Boolean(client),
    signInWithGoogle,
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

function userDisplayName(user: User) {
  const metadata = user.user_metadata as Record<string, unknown>;
  const name = [metadata.full_name, metadata.name].find((value) => typeof value === "string" && value.trim());
  return typeof name === "string" ? name.trim() : user.email ?? "ログイン中";
}
