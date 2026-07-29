import assert from "node:assert/strict";
import test from "node:test";
import { mergeFavoriteRecords } from "../lib/portal-activity.ts";

test("favorite synchronization keeps the newest state for each process", () => {
  const merged = mergeFavoriteRecords(
    {
      "official-a": { active: true, updatedAt: 100 },
      "official-b": { active: false, updatedAt: 300 },
    },
    {
      "official-a": { active: false, updatedAt: 200 },
      "official-b": { active: true, updatedAt: 250 },
      "official-c": { active: true, updatedAt: 400 },
    },
  );

  assert.deepEqual(merged, {
    "official-a": { active: false, updatedAt: 200 },
    "official-b": { active: false, updatedAt: 300 },
    "official-c": { active: true, updatedAt: 400 },
  });
});
