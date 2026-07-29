type UserIdentity = {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export function userDisplayName(user: UserIdentity, fallback = "ログイン中") {
  const metadata = user.user_metadata ?? {};
  const value = [metadata.display_name, metadata.full_name, metadata.name].find(
    (candidate) => typeof candidate === "string" && candidate.trim(),
  );
  return typeof value === "string" ? value.trim() : user.email?.trim() || fallback;
}
