import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants } from "node:zlib";
import { promisify } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "@duckdb", "duckdb-wasm", "dist");
const packageDefinition = JSON.parse(await readFile(join(root, "node_modules", "@duckdb", "duckdb-wasm", "package.json"), "utf8"));
const target = join(root, "public", "duckdb", packageDefinition.version);
const assets = [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
];
const compress = promisify(brotliCompress);

await mkdir(target, { recursive: true });
await Promise.all(assets.map((asset) => copyFile(join(source, asset), join(target, asset))));
await Promise.all(assets.filter((asset) => asset.endsWith(".wasm")).map(async (asset) => {
  const sourceBytes = await readFile(join(source, asset));
  const compressed = await compress(sourceBytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 9,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_GENERIC,
    },
  });
  await writeFile(join(target, `${asset}.br`), compressed);
}));
console.log(`Copied DuckDB-Wasm ${packageDefinition.version} assets and prepared Brotli modules.`);
