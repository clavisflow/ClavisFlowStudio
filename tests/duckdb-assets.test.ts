import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { DUCKDB_ASSET_BASE_PATH, DUCKDB_ASSET_VERSION } from "../lib/duckdb-assets.ts";

test("DuckDB assets use a versioned, compressed, immutable deployment path", async () => {
  const packageDefinition = JSON.parse(await readFile("node_modules/@duckdb/duckdb-wasm/package.json", "utf8"));
  assert.equal(DUCKDB_ASSET_VERSION, packageDefinition.version);
  assert.equal(DUCKDB_ASSET_BASE_PATH, `/duckdb/${packageDefinition.version}`);

  for (const asset of ["duckdb-eh.wasm", "duckdb-mvp.wasm"]) {
    const original = await stat(`public${DUCKDB_ASSET_BASE_PATH}/${asset}`);
    const compressed = await stat(`public${DUCKDB_ASSET_BASE_PATH}/${asset}.br`);
    assert.ok(compressed.size < original.size / 2, `${asset}.br should be materially smaller than its source`);
  }

  const staticConfig = JSON.parse(await readFile("public/staticwebapp.config.json", "utf8"));
  const immutableRoute = staticConfig.routes.find((route: { route?: string }) => route.route === `${DUCKDB_ASSET_BASE_PATH}/*`);
  assert.match(immutableRoute?.headers?.["Cache-Control"] ?? "", /max-age=31536000/);
  assert.match(immutableRoute?.headers?.["Cache-Control"] ?? "", /immutable/);
});
