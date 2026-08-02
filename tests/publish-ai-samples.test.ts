import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../components/flow-editor.tsx", import.meta.url), "utf8");

test("公開STEPから生成済みAIサンプルを直接選択できる", () => {
  assert.match(editor, /async function selectAiSampleFile\(input: FlowInput\)/);
  assert.match(editor, /aiSampleTabularRows\(aiSamples, input\)/);
  assert.match(editor, /csvFileFromTabularRows\(rows, `AIサンプル-\$\{input\.label\}\.csv`, aiSampleEncoding\(input\)\)/);
  assert.match(editor, /hasCurrentAiSample && <button/);
  assert.match(editor, /onClick=\{\(\) => void selectAiSampleFile\(input\)\}/);
  assert.match(editor, /AIサンプルを使う/);
});

test("AI再生成後の結果確認で新しいAIサンプルを上書きしない", () => {
  assert.match(editor, /let draftForPreview = draft;/);
  assert.match(editor, /draftForPreview = applySqlRequiredColumns\(\{[\s\S]*?aiSamples: generated\.samples/);
  assert.match(editor, /await runPreview\(sql, draftForPreview\);/);
  assert.match(editor, /async function runPreview\(sqlOverride = draft\.sql, baseDraft = draft\)/);
});

test("公開サンプルには機密情報を含めないよう注意を表示する", () => {
  assert.match(
    editor,
    /サンプルデータに個人情報・機密情報・実在する顧客データを含めないでください。/,
  );
  assert.match(editor, /className="publish-samples-warning"/);
});
