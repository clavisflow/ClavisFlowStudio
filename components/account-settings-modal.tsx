"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Mail, UserRound, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

type AccountSettingsModalProps = {
  onClose: () => void;
  onSaved: (displayName: string) => void;
};

export function AccountSettingsModal({ onClose, onSaved }: AccountSettingsModalProps) {
  const { user, displayName, updateDisplayName } = useAuth();
  const titleId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!user) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("表示名を入力してください。");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await updateDisplayName(normalizedName);
      onSaved(normalizedName);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "表示名を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="account-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="account-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <div>
            <h2 id={titleId}>アカウント設定</h2>
            <p id={descriptionId}>公開した処理に表示する名前を設定できます。</p>
          </div>
          <button type="button" aria-label="アカウント設定を閉じる" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <label className="account-settings-field">
            <span>表示名</span>
            <div>
              <UserRound size={18} aria-hidden="true" />
              <input
                autoFocus
                type="text"
                value={name}
                maxLength={80}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </div>
            <small>今後、処理を公開・更新した際の更新者名として使用します。</small>
          </label>

          <label className="account-settings-field">
            <span>メールアドレス</span>
            <div>
              <Mail size={18} aria-hidden="true" />
              <input type="email" value={user.email ?? ""} readOnly aria-readonly="true" />
            </div>
            <small>Googleアカウントから取得しています。ここでは変更できません。</small>
          </label>

          {error && <p className="account-settings-error" role="alert">{error}</p>}

          <footer>
            <button className="button secondary" type="button" onClick={onClose} disabled={saving}>キャンセル</button>
            <button className="button primary" type="submit" disabled={saving || !name.trim()}>
              {saving ? "保存中…" : "変更を保存"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
