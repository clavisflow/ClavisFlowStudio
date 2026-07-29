import test from "node:test";
import assert from "node:assert/strict";
import { userDisplayName } from "../lib/user-display-name.ts";

test("設定した表示名をGoogleの名前より優先する", () => {
  assert.equal(
    userDisplayName({
      email: "user@example.com",
      user_metadata: {
        display_name: "Clavis 太郎",
        full_name: "Google User",
        name: "Google User",
      },
    }),
    "Clavis 太郎",
  );
});

test("表示名が未設定ならGoogleの名前、メールアドレスの順に使う", () => {
  assert.equal(
    userDisplayName({
      email: "user@example.com",
      user_metadata: { full_name: "Google User" },
    }),
    "Google User",
  );
  assert.equal(userDisplayName({ email: "user@example.com" }), "user@example.com");
});

test("空白だけの表示名は使用しない", () => {
  assert.equal(
    userDisplayName({
      email: "user@example.com",
      user_metadata: { display_name: "   ", name: "Fallback User" },
    }),
    "Fallback User",
  );
});
