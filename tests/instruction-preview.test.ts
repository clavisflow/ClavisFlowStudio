import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");

test("やりたいことを編集しても現在の結果を残し変更前だと表示する", () => {
  assert.match(editor, /onChange=\{\(event\) => setInstruction\(event\.target\.value\)\}/);
  assert.doesNotMatch(editor, /setInstruction\(event\.target\.value\);[^}]*clearPreview\(\)/);
  assert.match(editor, /const previewHasUnappliedInstruction = Boolean\(preview && generatedInstruction !== instruction\.trim\(\)\)/);
  assert.match(editor, /previewHasUnappliedInstruction && <span[^>]*>変更前の結果<\/span>/);
});

test("やりたいことの変更を再確認するまで公開へ進めない", () => {
  assert.match(editor, /step === 3 && Boolean\(preview\) && !previewHasUnappliedInstruction/);
  assert.match(editor, /disabled=\{!preview \|\| previewing \|\| previewHasUnappliedInstruction\}/);
});

test("入力列が変わったらAIで再判定するまで既存SQLを実行しない", () => {
  assert.match(editor, /generatedInputSignature !== inputSchemaSignature\(draft\.inputs\)/);
  assert.match(editor, /analyzeFile\(prepared\.file, input\)\)/);
  assert.doesNotMatch(editor, /analyzeFile\(prepared\.file, input, false\)\)/);
  assert.match(editor, /disabled=\{previewing \|\| inputSchemaNeedsRegeneration\}/);
  assert.match(editor, /AIで再判定して結果を確認/);
});
