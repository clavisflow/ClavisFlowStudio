import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const target = join(root, "public", "duckdb");
const assets = [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
];

await mkdir(target, { recursive: true });
await Promise.all(assets.map((asset) => copyFile(join(source, asset), join(target, asset))));
console.log(`Copied ${assets.length} DuckDB-Wasm assets to public/duckdb.`);
