import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");

test("公開STEPから生成済みAIサンプルを直接選択できる", () => {
  assert.match(editor, /async function selectAiSampleFile\(input: FlowInput\)/);
  assert.match(editor, /aiSampleTabularRows\(aiSamples, input\)/);
  assert.match(editor, /hasCurrentAiSample && <button/);
  assert.match(editor, /onClick=\{\(\) => void selectAiSampleFile\(input\)\}/);
  assert.match(editor, /AIサンプルを公開用に使う/);
});
