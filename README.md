# ClavisFlow Studio

**毎月のデータ処理を、URLにする。**

ClavisFlow Studioは、公開されたFlow定義を使って実行者のCSVをブラウザ内で処理するNext.jsアプリです。CSV本体をAzure、Supabase、AI APIへアップロードしません。このリポジトリにはStep 1（Supabase基盤）とStep 2（最小の縦切り実装）が含まれます。

## 実装済みの範囲

- Next.js App Routerの静的出力（`out/`）
- Supabase PostgreSQLの`flows` / `flow_versions`スキーマ、RLS、不変バージョントリガー
- Flow作成、更新、公開、取得、公開停止、AI SQL生成のEdge Functions
- 編集トークンのSHA-256ハッシュ保存（平文は作成レスポンスで一度だけ返却）
- 公開URL `/run/?flow=<public-id>` とログイン不要の実行画面
- UTF-8、UTF-8 BOM、Shift-JIS、Windows-31J / CP932の明示選択と自動判定
- CSV列検証、DuckDB-Wasm実行、100行プレビュー、件数表示、CSVダウンロード
- 60秒タイムアウト、キャンセル、WorkerとDuckDBの破棄
- 読取専用・単一SQLの字句／構造検査、外部readerと拡張機能の拒否
- CSV Formula Injection対策
- 「請求・入金チェック」デモFlow

## アーキテクチャ

ブラウザは公開FlowのJSON定義だけをSupabase Edge Functionから取得します。選択された`File`は`arrayBuffer()`として専用Workerへ移動し、文字コード変換後、Worker内からDuckDB-WasmのWorkerへ登録します。React stateにCSV本文は保持しません。結果CSVはローカルのBlob URLとして生成されます。

画面は次の責務に分離しています。

- `/`：CSV追加から始まる4ステップのFlow作成画面
- `/flows/new/`：`/`と同じFlow作成画面
- `/flows/edit/?flow=<公開ID>`：新バージョンの保存と公開管理
- `/run/?flow=<公開ID>`：ログイン不要の公開実行画面

MVPでは通常認証とユーザー単位のFlow一覧を表示しません。作成・編集したFlowの参照と編集トークンはブラウザの`localStorage`へ保持し、保存完了画面から編集用URLを取得します。Flow定義の正本はSupabaseにあり、CSV本文は`localStorage`にもSupabaseにも保存しません。Supabase未接続のローカル開発では、Flow定義だけをブラウザへ保存して画面遷移を検証できます。

Flow作成は「ファイルを追加」「処理を作成」「結果を確認」「公開」の順です。CSVの行数、列名、文字コード、列型はWeb Workerで自動解析し、ファイル本体をReact stateやサーバーへ保存しません。

SQL検査は公開時とブラウザ実行時に行います。DuckDB側でも既知拡張の自動インストール／ロードを無効化します。Wasmの仮想ファイルシステムへ登録するファイル名はFlowの検証済みテーブル名から生成します。

## ローカル開発

前提: Node.js 24、npm。Supabaseをローカル起動する場合はDockerとSupabase CLIも必要です。

```bash
npm install
copy .env.example .env.local
npm run dev
```

`npm install`後のスクリプトがDuckDBのWasmとWorkerを`public/duckdb/`へコピーします。このディレクトリは生成物のためGit管理しません。

### VS CodeでF5デバッグ

リポジトリのルートフォルダーをVS Codeで開き、`npm install`を一度実行した後に`F5`を押してください。既定の`Next.js: debug full stack (F5)`構成が開発サーバーをデバッガー付きで起動し、準備完了後にMicrosoft Edgeを自動で開きます。停止すると開発サーバーも終了します。

サーバー側だけ、または既に起動済みのサーバーへブラウザだけを接続したい場合は、VS Codeの「実行とデバッグ」から対応する構成を選択できます。

Supabaseを接続しない場合も、`http://localhost:3000/run/?flow=invoice-payment-check`は同梱デモ定義へフォールバックします。請求CSVには`請求番号,請求金額`、入金CSVには`請求番号,入金額`が必要です。

画面から選択・ダウンロードできる各文字コードのサンプルCSVは、次のコマンドで再生成できます。

```bash
npm run samples
```

品質確認:

```bash
npm test
npm run lint
npm run build
```

## Supabaseプロジェクト準備

1. Supabaseで新しいプロジェクトを作成します。
2. CLIをリンクし、マイグレーションを適用します。

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

3. Edge Function用シークレットを`supabase/.env`へ作成します。`SUPABASE_URL`と`SUPABASE_SERVICE_ROLE_KEY`はSupabase側で自動提供されるため、本番用の手動登録は不要です。それ以外を登録します。

```dotenv
ALLOWED_ORIGIN=https://studio.clavisflow.net
PUBLIC_APP_URL=https://studio.clavisflow.net
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_API_KEY=replace-me
OPENAI_COMPATIBLE_MODEL=gpt-5-mini
```

```bash
npx supabase secrets set --env-file supabase/.env
```

4. 関数を配備します。

```bash
npx supabase functions deploy create-flow
npx supabase functions deploy update-flow
npx supabase functions deploy publish-flow
npx supabase functions deploy get-public-flow
npx supabase functions deploy get-edit-flow
npx supabase functions deploy unpublish-flow
npx supabase functions deploy generate-sql
```

5. Azureビルド環境とローカルの`.env.local`へ、ブラウザ公開可能なURLだけを設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
```

Service RoleキーとAI APIキーには`NEXT_PUBLIC_`を付けないでください。フロントエンドのバンドルへ入れてはいけません。

### Edge Function API

| 関数 | メソッド | 認可 |
|---|---|---|
| `create-flow` | POST | 公開（MVP。運用前にレート制限／Turnstile推奨） |
| `update-flow` | POST | `x-edit-token` |
| `publish-flow` | POST | `x-edit-token` |
| `get-public-flow?id=...` | GET | 公開済みFlowのみ匿名 |
| `get-edit-flow` | POST | `x-edit-token` |
| `unpublish-flow` | POST | `x-edit-token` |
| `generate-sql` | POST | 公開（MVP。運用前にレート制限必須） |

作成・更新の定義本文は`inputs`, `sql`, `output`, `duckdbVersion`です。更新は常に次の`flow_versions.version_number`を挿入し、既存公開版を変更しません。

## Azure Static Web Appsへ配備

1. Azure Static Web Appsリソースを作成し、独自ドメイン`studio.clavisflow.net`を設定します。
2. GitHub Environment/Repositoryへ次を設定します。
   - Secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Variable: `NEXT_PUBLIC_SUPABASE_URL`
3. `.github/workflows/azure-static-web-apps.yml`を有効にして`main`へpushします。

ワークフローはNode.jsで`npm ci`と`npm run build`を行い、静的成果物`out/`を配備します。`public/staticwebapp.config.json`は成果物へコピーされ、Wasm MIME、CSP、Worker、Supabase接続先を設定します。

## セキュリティ上の境界

- SQL検査は保守的な字句／構造検査です。`SELECT` / `WITH`の単一文だけを許可し、DDL、DML、`COPY`、`ATTACH`、`INSTALL`、`LOAD`、`PRAGMA`、外部readerを拒否します。
- DuckDB-WasmにはOSファイルシステムがありませんが、公開前の防御として検査を必須にしています。新しいDuckDB機能を導入する際は拒否リストとテストを更新してください。
- CSPの`connect-src`はSupabaseだけを許可します。別のSupabase互換ドメインを使う場合は`public/staticwebapp.config.json`を更新します。
- 作成とAI生成は匿名MVPエンドポイントです。本番公開前にIP/トークン単位のレート制限とTurnstile等のbot対策を追加してください。
- 最大入力は1ファイル250MB、最大出力は100万行です。ブラウザごとのWasmメモリ制限が先に到達する場合があります。

## 次の実装

AIによるSQL生成・修正対話、編集シークレットURLの復元導線、E2E、PWAを追加します。手入力SQLによるCSV解析・テスト・保存・公開は実装済みです。
